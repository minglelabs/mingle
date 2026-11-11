import { prisma } from '@/lib/prisma'
import { MICRO_PER_COIN, microToDisplayCoins } from '@/lib/coin-units'
import { grantLot, hasLedgerEntry, takeFromLots, withLockedWalletPair, type CoinLotSource } from './ledger'
import { snapshotFromContext, type CoinWalletSnapshot } from './wallet'

// Gifting Hash to another user. Only Hash the sender bought can be gifted: free
// Hash (daily refill, sign-up bonus, free admin grants), admin grants and Hash
// received as a gift stay with their owner. The sender pays the whole amount,
// the service keeps GIFT_FEE_BPS of it and the recipient gets the rest as paid
// Hash that does not expire.

export const GIFT_FEE_BPS = 1_000n
export const GIFTABLE_LOT_SOURCES: readonly CoinLotSource[] = ['purchase']
// Far above any real balance; keeps the BigInt math away from absurd input.
const MAX_GIFT_COINS = 1_000_000_000_000

export type CoinGiftErrorCode =
  | 'gift_invalid_amount'
  | 'gift_self'
  | 'gift_recipient_unavailable'
  | 'gift_insufficient_paid_balance'

export class CoinGiftError extends Error {
  constructor(readonly code: CoinGiftErrorCode, readonly giftableCoins?: number) {
    super(code)
  }
}

/** The fee is rounded up, so the recipient never gets more than (1 - fee) of the amount. */
export function quoteCoinGift(amountMicro: bigint): { feeMicro: bigint; receivedMicro: bigint } {
  if (amountMicro <= 0n) return { feeMicro: 0n, receivedMicro: 0n }
  const feeMicro = (amountMicro * GIFT_FEE_BPS + 9_999n) / 10_000n
  return { feeMicro, receivedMicro: amountMicro - feeMicro }
}

type LotReader = Pick<typeof prisma, 'appCoinLot'>

async function readGiftableMicro(db: LotReader, userId: string, now: Date): Promise<bigint> {
  const sum = await db.appCoinLot.aggregate({
    where: {
      userId,
      isFree: false,
      source: { in: [...GIFTABLE_LOT_SOURCES] },
      remainingMicro: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    _sum: { remainingMicro: true },
  })
  return sum._sum.remainingMicro ?? 0n
}

/** What the gift sheet shows before sending. */
export async function getCoinGiftInfo(userId: string): Promise<{ giftableCoins: number; feePercent: number }> {
  return {
    giftableCoins: microToDisplayCoins(await readGiftableMicro(prisma, userId, new Date())),
    feePercent: Number(GIFT_FEE_BPS) / 100,
  }
}

export type CoinGiftResult = {
  duplicate: boolean
  sentCoins: number
  feeCoins: number
  receivedCoins: number
  giftableCoins: number
  wallet: CoinWalletSnapshot
}

const microToCoinNumber = (micro: bigint) => Number(micro) / Number(MICRO_PER_COIN)

/**
 * Moves `coins` whole Hash from the sender's purchased lots to the recipient,
 * minus the fee. All or nothing, and idempotent on idempotencyKey.
 */
export async function sendCoinGift(input: {
  senderId: string
  recipientId: string
  coins: number
  idempotencyKey: string
  now?: Date
}): Promise<CoinGiftResult> {
  const { senderId, recipientId, coins } = input
  if (!Number.isSafeInteger(coins) || coins < 1 || coins > MAX_GIFT_COINS) throw new CoinGiftError('gift_invalid_amount')
  if (!input.idempotencyKey) throw new CoinGiftError('gift_invalid_amount')
  if (senderId === recipientId) throw new CoinGiftError('gift_self')

  const [recipient, block] = await Promise.all([
    prisma.user.findUnique({ where: { id: recipientId }, select: { isActive: true } }),
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: recipientId },
          { blockerId: recipientId, blockedId: senderId },
        ],
      },
      select: { blockerId: true },
    }),
  ])
  if (!recipient?.isActive || block) throw new CoinGiftError('gift_recipient_unavailable')

  const amountMicro = BigInt(coins) * MICRO_PER_COIN
  const { feeMicro, receivedMicro } = quoteCoinGift(amountMicro)
  const key = `gift:${senderId}:${input.idempotencyKey}`

  return withLockedWalletPair(senderId, recipientId, async (sender, receiver) => {
    const result = async (duplicate: boolean): Promise<CoinGiftResult> => ({
      duplicate,
      sentCoins: coins,
      feeCoins: microToCoinNumber(feeMicro),
      receivedCoins: microToCoinNumber(receivedMicro),
      giftableCoins: microToDisplayCoins(await readGiftableMicro(sender.tx, senderId, sender.now)),
      wallet: snapshotFromContext(sender),
    })
    if (await hasLedgerEntry(sender, key)) return result(true)

    const giftableMicro = await readGiftableMicro(sender.tx, senderId, sender.now)
    if (giftableMicro < amountMicro) {
      throw new CoinGiftError('gift_insufficient_paid_balance', microToDisplayCoins(giftableMicro))
    }
    const taken = await takeFromLots(sender, {
      type: 'gift_sent',
      amountMicro,
      idempotencyKey: key,
      filter: { isFree: false, sources: GIFTABLE_LOT_SOURCES },
      meta: { toUserId: recipientId, feeMicro: feeMicro.toString(), receivedMicro: receivedMicro.toString() },
    })
    // Cannot happen under the wallet lock; throwing rolls the whole gift back.
    if (taken.shortfallMicro > 0n) throw new CoinGiftError('gift_insufficient_paid_balance')
    await grantLot(receiver, {
      source: 'gift',
      isFree: false,
      amountMicro: receivedMicro,
      idempotencyKey: `${key}:received`,
      meta: { fromUserId: senderId },
    })
    return result(false)
  }, { now: input.now })
}
