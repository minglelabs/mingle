import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { COIN_INSUFFICIENT_ERROR } from '@/lib/coin-units'
import { IapVerificationError, verifyAppleNotification, readAppleTransaction } from '@/server/coins/iap-apple'
import { parseGooglePlayNotification } from '@/server/coins/iap-google'
import { COIN_USAGE_KINDS, type CoinUsageKind, type CoinUsageUnits } from '@/server/coins/pricing'
import { listCoinProducts, refundPurchase, verifyAndGrantPurchase, type IapPlatform } from '@/server/coins/purchases'
import { getCoinHistory, getCoinUsageSummary, normalizeCoinUsageRange } from '@/server/coins/queries'
import { isInternalCoinRequestAuthorized, mintSttBillingToken, verifySttBillingToken } from '@/server/coins/stt-token'
import { chargeCoinUsage, getCoinWallet } from '@/server/coins/wallet'
import { resolveCoinBillingMode } from '@/server/coins/config'
import { prisma } from '@/lib/prisma'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

async function readSessionUserId(): Promise<string> {
  const session = await getServerSession(getAuthOptions()) as { user?: { id?: unknown } } | null
  return typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
}

/** ios / android from a namespaced path (/api/ios/v2.1.0/...); null on the web (unversioned) API. */
function resolveRequestPlatform(request: NextRequest): IapPlatform | null {
  const match = /^\/api\/(ios|android)\/v\d+\.\d+\.\d+\//.exec(request.nextUrl.pathname)
  return match ? match[1] as IapPlatform : null
}

/** GET /coins/wallet — pays the daily free refill when due. */
export async function readCoinWallet() {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const wallet = await getCoinWallet(userId)
  return json({ ...wallet, sttBillingToken: mintSttBillingToken(userId) })
}

/** GET /coins/products */
export async function readCoinProducts(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const platform = resolveRequestPlatform(request)
  return json({ platform, products: platform ? await listCoinProducts(platform) : [] })
}

const CLIENT_ERROR_CODES = new Set([
  'invalid_jws',
  'unsupported_jws_alg',
  'missing_certificate_chain',
  'invalid_certificate_chain',
  'certificate_expired',
  'untrusted_certificate_root',
  'invalid_jws_signature',
  'bundle_mismatch',
  'invalid_transaction',
  'transaction_revoked',
  'unsupported_product_type',
  'unknown_product',
  'purchase_not_completed',
])

/** POST /coins/purchases — verifies the transaction with the store, then grants once. */
export async function createCoinPurchase(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const platform = resolveRequestPlatform(request)
  if (!platform) return json({ error: 'platform_required' }, 400)
  const body = await request.json().catch((): Record<string, unknown> => ({}))
  const read = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 16_384) : '')

  try {
    const result = await verifyAndGrantPurchase(userId, {
      platform,
      jws: read(body.jws),
      productId: read(body.productId),
      purchaseToken: read(body.purchaseToken),
    })
    return json(result)
  } catch (error) {
    if (error instanceof IapVerificationError) {
      // pending (e.g. Ask to Buy, slow payment): the client keeps the transaction and retries later.
      if (error.code === 'purchase_pending') return json({ error: error.code }, 202)
      if (error.code === 'purchase_belongs_to_another_account') return json({ error: error.code }, 409)
      if (CLIENT_ERROR_CODES.has(error.code)) return json({ error: error.code }, 400)
      console.error('[coins] purchase verification unavailable', error.code)
      return json({ error: error.code }, 503)
    }
    console.error('[coins] purchase failed', error instanceof Error ? error.message : 'unknown')
    return json({ error: 'purchase_failed' }, 500)
  }
}

/** GET /coins/history?cursor= */
export async function readCoinHistory(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  return json(await getCoinHistory(userId, request.nextUrl.searchParams.get('cursor')))
}

/** GET /coins/usage?range=today|7d|30d&tz=<minutes east of UTC> */
export async function readCoinUsage(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const params = request.nextUrl.searchParams
  return json(await getCoinUsageSummary(userId, normalizeCoinUsageRange(params.get('range')), {
    tzOffsetMinutes: Number(params.get('tz') ?? 0),
  }))
}

const MAX_STT_CHUNK_SECONDS = 120

/**
 * POST /internal/coins/charge — service-to-service (mingle-stt). The caller
 * proves itself with the shared secret and names the user with the STT billing
 * token the client forwarded. seconds = 0 is the start gate.
 */
export async function chargeCoinsInternally(request: NextRequest) {
  if (!isInternalCoinRequestAuthorized(request.headers.get('authorization'))) {
    return json({ error: 'unauthorized' }, 401)
  }
  const body = await request.json().catch((): Record<string, unknown> => ({}))
  const identity = verifySttBillingToken(body.billingToken)
  if (!identity) return json({ error: 'invalid_billing_token' }, 401)

  const kind = COIN_USAGE_KINDS.includes(body.kind as CoinUsageKind) ? body.kind as CoinUsageKind : null
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim().slice(0, 200) : ''
  if (kind !== 'stt' || !idempotencyKey) return json({ error: 'invalid_charge' }, 400)
  const rawSeconds = typeof body.seconds === 'number' && Number.isFinite(body.seconds) ? body.seconds : 0
  const seconds = Math.max(0, Math.min(MAX_STT_CHUNK_SECONDS, rawSeconds))
  const enforced = resolveCoinBillingMode() === 'enforce'

  if (seconds === 0) {
    const wallet = await getCoinWallet(identity.userId)
    const exhausted = enforced && wallet.exhausted
    return json({ balanceExhausted: exhausted, ...(exhausted ? { error: COIN_INSUFFICIENT_ERROR } : {}) })
  }

  const units: CoinUsageUnits = { second: seconds }
  const result = await chargeCoinUsage({
    userId: identity.userId,
    kind,
    units,
    model: typeof body.model === 'string' ? body.model.slice(0, 64) : null,
    provider: typeof body.provider === 'string' ? body.provider.slice(0, 64) : null,
    sessionKey: typeof body.sessionKey === 'string' ? body.sessionKey.trim().slice(0, 128) || null : null,
    idempotencyKey: `stt:${identity.userId}:${idempotencyKey}`,
  })
  return json({
    balanceExhausted: result.balanceExhausted,
    ...(result.balanceExhausted ? { error: COIN_INSUFFICIENT_ERROR } : {}),
  })
}

async function recordStoreEvent(input: {
  platform: IapPlatform
  notificationType: string
  notificationId: string | null
  storeTransactionId: string | null
  rawPayload: Record<string, unknown>
}): Promise<string | null> {
  try {
    const event = await prisma.appIapStoreEvent.create({
      data: {
        platform: input.platform,
        notificationType: input.notificationType,
        notificationId: input.notificationId ? `${input.platform}:${input.notificationId}` : null,
        storeTransactionId: input.storeTransactionId,
        rawPayload: input.rawPayload as object,
      },
      select: { id: true },
    })
    return event.id
  } catch (error) {
    // Duplicate delivery of a notification we already stored.
    if ((error as { code?: unknown } | null)?.code === 'P2002') return null
    throw error
  }
}

async function finishStoreEvent(eventId: string, processResult: string) {
  await prisma.appIapStoreEvent.update({ where: { id: eventId }, data: { processedAt: new Date(), processResult } })
}

/** POST /webhooks/appstore — App Store Server Notifications V2. */
export async function handleAppStoreWebhook(request: NextRequest) {
  const body = await request.json().catch((): Record<string, unknown> => ({}))
  let notification
  try {
    notification = verifyAppleNotification(typeof body.signedPayload === 'string' ? body.signedPayload : '')
  } catch (error) {
    return json({ error: error instanceof IapVerificationError ? error.code : 'invalid_notification' }, 400)
  }
  const transactionId = typeof notification.transaction?.transactionId === 'string'
    ? notification.transaction.transactionId
    : null
  const eventId = await recordStoreEvent({
    platform: 'ios',
    notificationType: [notification.notificationType, notification.subtype].filter(Boolean).join(':'),
    notificationId: notification.notificationUuid,
    storeTransactionId: transactionId,
    rawPayload: { ...notification.rawPayload, transaction: notification.transaction },
  })
  if (!eventId) return json({ ok: true, duplicate: true })

  let result = 'ignored'
  if (transactionId && (notification.notificationType === 'REFUND' || notification.notificationType === 'REVOKE')) {
    result = await refundPurchase(transactionId, notification.notificationType === 'REVOKE' ? 'revoked' : 'refunded')
  } else if (notification.transaction && notification.notificationType === 'ONE_TIME_CHARGE') {
    // Informational: the grant itself happens when the app posts the transaction.
    try {
      readAppleTransaction(notification.transaction)
      result = 'noted'
    } catch {
      result = 'invalid_transaction'
    }
  }
  await finishStoreEvent(eventId, result)
  return json({ ok: true })
}

/**
 * POST /webhooks/googleplay?token=... — Pub/Sub push of real-time developer
 * notifications. The push subscription URL carries GOOGLE_PLAY_RTDN_TOKEN.
 */
export async function handleGooglePlayWebhook(request: NextRequest) {
  const expectedToken = (process.env.GOOGLE_PLAY_RTDN_TOKEN || '').trim()
  if (!expectedToken || request.nextUrl.searchParams.get('token') !== expectedToken) {
    return json({ error: 'unauthorized' }, 401)
  }
  const notification = parseGooglePlayNotification(await request.json().catch(() => null))
  if (!notification) return json({ error: 'invalid_notification' }, 400)
  const eventId = await recordStoreEvent({
    platform: 'android',
    notificationType: notification.notificationType,
    notificationId: notification.messageId,
    storeTransactionId: notification.purchaseToken,
    rawPayload: notification.rawPayload,
  })
  if (!eventId) return json({ ok: true, duplicate: true })

  const result = notification.voided && notification.purchaseToken
    ? await refundPurchase(notification.purchaseToken)
    : 'ignored'
  await finishStoreEvent(eventId, result)
  return json({ ok: true })
}
