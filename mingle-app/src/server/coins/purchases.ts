import type { Prisma } from '@prisma/client/index'
import { prisma } from '@/lib/prisma'
import { microToDisplayCoins } from '@/lib/coin-units'
import { IapVerificationError, verifyAppleTransactionJws, type VerifiedStorePurchase } from './iap-apple'
import { consumeGooglePlayPurchase, verifyGooglePlayPurchase } from './iap-google'
import { grantLot, takeFromLots, withLockedWallet } from './ledger'
import {
  createPolarCheckout,
  getPolarOrder,
  readPolarConfig,
  type PolarOrder,
} from './polar'
import { getCoinWallet, type CoinWalletSnapshot } from './wallet'

export type IapPlatform = 'ios' | 'android'
// Web purchases go through Polar checkout instead of a store.
export type CoinProductPlatform = IapPlatform | 'web'

export type CoinProductDto = {
  productId: string
  coins: number
  bonusCoins: number
  totalCoins: number
  priceUsdCents: number
  badge: string | null
}

export async function listCoinProducts(platform: CoinProductPlatform): Promise<CoinProductDto[]> {
  // A web pack is sold only once it is linked to a Polar product and Polar is configured.
  if (platform === 'web' && !readPolarConfig()) return []
  const rows = await prisma.appIapProduct.findMany({
    where: { platform, isActive: true, ...(platform === 'web' ? { providerProductId: { not: null } } : {}) },
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

/** Starts a Polar checkout for a web pack and returns the hosted checkout URL. */
export async function createWebCoinCheckout(input: {
  userId: string
  storeProductId: string
  origin: string
  returnPath: string
}): Promise<{ url: string }> {
  const config = readPolarConfig()
  if (!config) throw new IapVerificationError('polar_not_configured')
  const product = await prisma.appIapProduct.findUnique({
    where: { platform_storeProductId: { platform: 'web', storeProductId: input.storeProductId } },
  })
  if (!product?.isActive || !product.providerProductId) throw new IapVerificationError('unknown_product')
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } })

  const back = new URL(input.returnPath, input.origin)
  const success = new URL(back)
  success.searchParams.set('coin_checkout', 'success')
  const checkout = await createPolarCheckout(config, {
    polarProductId: product.providerProductId,
    userId: input.userId,
    coinProductId: product.storeProductId,
    customerEmail: user?.email,
    successUrl: success.toString(),
    returnUrl: back.toString(),
  })
  return { url: checkout.url }
}

/** Reads the order back from Polar (never trusting the webhook body) and maps it to a purchase. */
async function verifyPolarOrder(orderId: string): Promise<{ order: PolarOrder; verified: VerifiedStorePurchase | null }> {
  const config = readPolarConfig()
  if (!config) throw new IapVerificationError('polar_not_configured')
  const order = await getPolarOrder(config, orderId)
  if (!order.paid || !order.userId || !order.coinProductId) return { order, verified: null }
  const product = await prisma.appIapProduct.findUnique({
    where: { platform_storeProductId: { platform: 'web', storeProductId: order.coinProductId } },
    select: { providerProductId: true },
  })
  // The order must be for the Polar product this pack is linked to.
  if (!product?.providerProductId || product.providerProductId !== order.polarProductId) {
    throw new IapVerificationError('unknown_product')
  }
  return {
    order,
    verified: {
      platform: 'web',
      storeTransactionId: order.id,
      storeOriginalTransactionId: null,
      storeProductId: order.coinProductId,
      environment: config.sandbox ? 'sandbox' : 'production',
      // Polar reports cents; purchases store micros.
      priceAmountMicros: order.totalAmount === null ? null : BigInt(order.totalAmount) * 10_000n,
      priceCurrency: order.currency ? order.currency.toUpperCase() : null,
      storefrontCountry: order.country,
      rawPayload: order.raw,
    },
  }
}

export type PolarOrderEventResult = 'granted' | 'already_granted' | 'not_paid' | RefundResult

/** order.paid / order.refunded: grant a paid order once, or claw back a refunded one. */
export async function handlePolarOrderEvent(orderId: string): Promise<PolarOrderEventResult> {
  const { order, verified } = await verifyPolarOrder(orderId)
  // Any refund, full or partial, takes back what is left of the pack.
  if (order.status === 'refunded' || order.status === 'partially_refunded' || order.refundedAmount > 0) {
    return refundPurchase(order.id)
  }
  if (!verified || !order.userId) return 'not_paid'
  return (await grantVerifiedPurchase(order.userId, verified)).status
}
