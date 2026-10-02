import type { Prisma } from '@prisma/client/index'
import { prisma } from '@/lib/prisma'
import { microToDisplayCoins } from '@/lib/coin-units'
import { IapVerificationError, verifyAppleTransactionJws, type VerifiedStorePurchase } from './iap-apple'
import { consumeGooglePlayPurchase, verifyGooglePlayPurchase } from './iap-google'
import { grantLot, takeFromLots, withLockedWallet } from './ledger'
import { getCoinWallet, type CoinWalletSnapshot } from './wallet'

export type IapPlatform = 'ios' | 'android'

export type CoinProductDto = {
  productId: string
  coins: number
  bonusCoins: number
  totalCoins: number
  priceUsdCents: number
  badge: string | null
}

export async function listCoinProducts(platform: IapPlatform): Promise<CoinProductDto[]> {
  const rows = await prisma.appIapProduct.findMany({
    where: { platform, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { priceUsdCents: 'asc' }],
  })
  return rows.map(row => ({
    productId: row.storeProductId,
    coins: microToDisplayCoins(row.coinMicro),
    bonusCoins: microToDisplayCoins(row.bonusMicro),
    totalCoins: microToDisplayCoins(row.coinMicro + row.bonusMicro),
    priceUsdCents: row.priceUsdCents,
    badge: row.badge,
  }))
}

/**
 * Sandbox purchases (TestFlight, App Review, Play license testers) cost
 * nothing, so in production they grant real coins only while IAP_ALLOW_SANDBOX=1.
 * It must be on during App Review, which buys in the sandbox against production.
 */
export function isSandboxPurchaseAllowed(): boolean {
  const flag = (process.env.IAP_ALLOW_SANDBOX || '').trim()
  if (flag === '1' || flag === 'true') return true
  if (flag === '0' || flag === 'false') return false
  return process.env.NODE_ENV !== 'production'
}

export type PurchaseGrantResult = {
  status: 'granted' | 'already_granted'
  purchaseId: string
  grantedCoins: number
  wallet: CoinWalletSnapshot
}

/**
 * Grants a store-verified purchase exactly once (spec 6.3). The amount comes
 * only from app_iap_products; store_transaction_id is unique, and the check
 * runs under the buyer's wallet lock.
 */
export async function grantVerifiedPurchase(userId: string, verified: VerifiedStorePurchase): Promise<PurchaseGrantResult> {
  const product = await prisma.appIapProduct.findUnique({
    where: { platform_storeProductId: { platform: verified.platform, storeProductId: verified.storeProductId } },
  })
  if (!product) throw new IapVerificationError('unknown_product')
  if (verified.environment === 'sandbox' && !isSandboxPurchaseAllowed()) throw new IapVerificationError('sandbox_not_allowed')
  const totalMicro = product.coinMicro + product.bonusMicro

  const outcome = await withLockedWallet(userId, async (ctx) => {
    const existing = await ctx.tx.appIapPurchase.findUnique({
      where: { storeTransactionId: verified.storeTransactionId },
      select: { id: true, userId: true, status: true },
    })
    if (existing) {
      if (existing.userId !== userId) throw new IapVerificationError('purchase_belongs_to_another_account')
      return { status: 'already_granted' as const, purchaseId: existing.id }
    }
    const purchase = await ctx.tx.appIapPurchase.create({
      data: {
        userId,
        platform: verified.platform,
        productId: product.id,
        storeTransactionId: verified.storeTransactionId,
        storeOriginalTransactionId: verified.storeOriginalTransactionId,
        status: 'granted',
        priceAmountMicros: verified.priceAmountMicros,
        priceCurrency: verified.priceCurrency,
        storefrontCountry: verified.storefrontCountry,
        rawPayload: verified.rawPayload as Prisma.InputJsonValue,
        environment: verified.environment,
        verifiedAt: ctx.now,
        grantedAt: ctx.now,
      },
      select: { id: true },
    })
    const lot = await grantLot(ctx, {
      source: 'purchase',
      isFree: false,
      amountMicro: totalMicro,
      idempotencyKey: `purchase:${verified.platform}:${verified.storeTransactionId}`,
      purchaseId: purchase.id,
      meta: {
        storeProductId: verified.storeProductId,
        baseMicro: product.coinMicro.toString(),
        bonusMicro: product.bonusMicro.toString(),
      },
    })
    await ctx.tx.appIapPurchase.update({ where: { id: purchase.id }, data: { lotId: lot.lotId } })
    return { status: 'granted' as const, purchaseId: purchase.id }
  })

  return {
    ...outcome,
    grantedCoins: outcome.status === 'granted' ? microToDisplayCoins(totalMicro) : 0,
    wallet: await getCoinWallet(userId),
  }
}

export type PurchaseRequest = {
  platform: IapPlatform
  // iOS: the StoreKit 2 signed transaction (JWS).
  jws?: string
  // Android: product id + purchase token.
  productId?: string
  purchaseToken?: string
}

/** Verifies with the store, then grants. Android purchases are consumed after the grant commits. */
export async function verifyAndGrantPurchase(userId: string, request: PurchaseRequest): Promise<PurchaseGrantResult> {
  if (request.platform === 'ios') {
    if (!request.jws) throw new IapVerificationError('invalid_transaction')
    return grantVerifiedPurchase(userId, verifyAppleTransactionJws(request.jws))
  }
  const input = { storeProductId: request.productId || '', purchaseToken: request.purchaseToken || '' }
  const result = await grantVerifiedPurchase(userId, await verifyGooglePlayPurchase(input))
  // A failed consume is retried by the client (finishTransaction) and by the next restore.
  await consumeGooglePlayPurchase(input)
  return result
}

export type RefundResult = 'refunded' | 'already_refunded' | 'purchase_not_found'

/**
 * Refund or revocation (spec 6.4): takes back what is left of the purchase's
 * lot. Coins already spent are not owed; the unrecovered amount is recorded on
 * the purchase.
 */
export async function refundPurchase(
  storeTransactionId: string,
  status: 'refunded' | 'revoked' = 'refunded',
): Promise<RefundResult> {
  const purchase = await prisma.appIapPurchase.findUnique({
    where: { storeTransactionId },
    select: { id: true, userId: true },
  })
  if (!purchase) return 'purchase_not_found'

  return withLockedWallet(purchase.userId, async (ctx) => {
    const current = await ctx.tx.appIapPurchase.findUniqueOrThrow({
      where: { id: purchase.id },
      select: { status: true, lotId: true, meta: true },
    })
    if (current.status === 'refunded' || current.status === 'revoked') return 'already_refunded' as const
    const lot = current.lotId
      ? await ctx.tx.appCoinLot.findUnique({ where: { id: current.lotId }, select: { grantedMicro: true, remainingMicro: true } })
      : null
    const taken = lot && lot.remainingMicro > 0n
      ? await takeFromLots(ctx, {
          type: 'refund_clawback',
          amountMicro: lot.remainingMicro,
          idempotencyKey: `refund:${purchase.id}`,
          purchaseId: purchase.id,
          filter: { lotId: current.lotId! },
        })
      : { spentMicro: 0n }
    const unrecoveredMicro = (lot?.grantedMicro ?? 0n) - taken.spentMicro
    await ctx.tx.appIapPurchase.update({
      where: { id: purchase.id },
      data: {
        status,
        refundedAt: ctx.now,
        meta: {
          ...(typeof current.meta === 'object' && current.meta !== null && !Array.isArray(current.meta) ? current.meta : {}),
          clawedBackMicro: taken.spentMicro.toString(),
          unrecoveredMicro: unrecoveredMicro.toString(),
        },
      },
    })
    return 'refunded' as const
  }, { skipDailyGrant: true })
}
