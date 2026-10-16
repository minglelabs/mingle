import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { COIN_INSUFFICIENT_ERROR } from '@/lib/coin-units'
import { IapVerificationError, verifyAppleNotification, readAppleTransaction } from '@/server/coins/iap-apple'
import { parseGooglePlayNotification } from '@/server/coins/iap-google'
import {
  COIN_USAGE_KINDS,
  loadCoinPricingRates,
  quoteCoinUsage,
  type CoinUsageKind,
  type CoinUsageUnits,
} from '@/server/coins/pricing'
import {
  createWebCoinCheckout,
  handlePolarOrderEvent,
  listCoinProducts,
  refundPurchase,
  verifyAndGrantPurchase,
  type CoinProductPlatform,
  type IapPlatform,
} from '@/server/coins/purchases'
import { verifyPolarWebhookSignature } from '@/server/coins/polar'
import { getCoinHistory, getCoinUsageSummary, normalizeCoinUsageRange } from '@/server/coins/queries'
import { isInternalCoinRequestAuthorized, mintSttBillingToken, verifySttBillingToken } from '@/server/coins/stt-token'
import { canSpendCoins, chargeCoinUsage, disabledCoinWallet, getCoinWallet } from '@/server/coins/wallet'
import { resolveCoinBillingMode } from '@/server/coins/config'
import { prisma } from '@/lib/prisma'
import { resolveTtsRuntimeSelection } from '@/lib/tts-models'
import { parseApiNamespaceVersion } from '@/lib/api-namespace-version'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }
// Speaking rate of synthesized speech in our own logs: about 12 characters per second.
const TTS_CHARS_PER_SECOND = 12

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
  // Off = nothing is recorded: no wallet row, no daily refill, no STT billing identity.
  if (resolveCoinBillingMode() === 'off') return json({ ...disabledCoinWallet(), sttBillingToken: null })
  const [wallet, rates, user] = await Promise.all([
    getCoinWallet(userId),
    loadCoinPricingRates(),
    prisma.user.findUnique({ where: { id: userId }, select: { ttsModel: true } }),
  ])
  const coinsFor = (quote: { chargedMicro: bigint }) => Number(quote.chargedMicro) / 1_000_000
  const now = new Date()
  return json({
    ...wallet,
    sttBillingToken: mintSttBillingToken(userId),
    // What the user's own settings cost right now, for the notice shown when voice interpreting is turned on.
    rates: {
      sttCoinsPerMinute: coinsFor(quoteCoinUsage(rates, { kind: 'stt', model: 'soniox', units: { second: 60 }, at: now })),
      // One minute of spoken playback: 60 s of audio plus its text.
      ttsCoinsPerAudioMinute: coinsFor(quoteCoinUsage(rates, {
        kind: 'tts',
        model: resolveTtsRuntimeSelection(user?.ttsModel).runtimeModel,
        units: { second: 60, char: 60 * TTS_CHARS_PER_SECOND },
        at: now,
      })),
    },
  })
}

/** GET /coins/products */
export async function readCoinProducts(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  // The unversioned API is the web app: it sells through Polar checkout, never inside the store apps.
  const platform: CoinProductPlatform = resolveRequestPlatform(request) ?? 'web'
  // What one minute of interpreting (speech recognition) costs right now, for the "about N minutes" hint.
  const perMinute = quoteCoinUsage(await loadCoinPricingRates(), { kind: 'stt', model: 'soniox', units: { second: 60 }, at: new Date() })
  return json({
    platform,
    products: await listCoinProducts(platform),
    sttCoinsPerMinute: Number(perMinute.chargedMicro) / 1_000_000,
  })
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
  'sandbox_not_allowed',
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
 * 1.x app namespaces predate accounts. The namespace is self-reported, so this
 * exemption is only as strong as the client's honesty: set
 * COIN_STT_ALLOW_LEGACY_ANONYMOUS=0 once 1.x is no longer supported.
 */
function isUnbilledLegacySttNamespace(rawNamespace: unknown): boolean {
  if ((process.env.COIN_STT_ALLOW_LEGACY_ANONYMOUS || '').trim() === '0') return false
  const parsed = typeof rawNamespace === 'string' ? parseApiNamespaceVersion(rawNamespace) : null
  return parsed?.version[0] === 1
}

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
  if (!identity) {
    // No valid billing identity. Until billing is enforced nobody is billed. Once it
    // is, only account-less 1.x clients may still talk unbilled (they cannot have a
    // token); everyone else is refused, so dropping the token is not a free pass.
    if (resolveCoinBillingMode() !== 'enforce' || isUnbilledLegacySttNamespace(body.apiNamespace)) {
      return json({ balanceExhausted: false, billable: false })
    }
    return json({ error: 'invalid_billing_token' }, 401)
  }

  const kind = COIN_USAGE_KINDS.includes(body.kind as CoinUsageKind) ? body.kind as CoinUsageKind : null
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim().slice(0, 200) : ''
  if (kind !== 'stt' || !idempotencyKey) return json({ error: 'invalid_charge' }, 400)
  const rawSeconds = typeof body.seconds === 'number' && Number.isFinite(body.seconds) ? body.seconds : 0
  const seconds = Math.max(0, Math.min(MAX_STT_CHUNK_SECONDS, rawSeconds))
  const enforced = resolveCoinBillingMode() === 'enforce'

  if (seconds === 0) {
    const exhausted = enforced && !(await canSpendCoins(identity.userId))
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

const CHECKOUT_CLIENT_ERRORS = new Set(['unknown_product', 'polar_not_configured'])

/** POST /coins/web-checkout { productId, returnPath } — web only; returns the Polar checkout URL. */
export async function createCoinWebCheckout(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  // Store apps must buy through the store (App Store / Play billing rules).
  if (resolveRequestPlatform(request)) return json({ error: 'web_only' }, 400)
  const body = await request.json().catch((): Record<string, unknown> => ({}))
  const productId = typeof body.productId === 'string' ? body.productId.trim().slice(0, 100) : ''
  const rawPath = typeof body.returnPath === 'string' ? body.returnPath : '/'
  // A same-origin path only: never redirect the buyer somewhere else after paying.
  const returnPath = /^\/(?!\/)[^\\]*$/.test(rawPath) ? rawPath.slice(0, 500) : '/'
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || '').trim() || request.nextUrl.origin
  try {
    return json(await createWebCoinCheckout({ userId, storeProductId: productId, origin, returnPath }))
  } catch (error) {
    if (error instanceof IapVerificationError) {
      return json({ error: error.code }, CHECKOUT_CLIENT_ERRORS.has(error.code) ? 400 : 503)
    }
    console.error('[coins] web checkout failed', error instanceof Error ? error.message : 'unknown')
    return json({ error: 'checkout_failed' }, 500)
  }
}

/**
 * POST /webhooks/polar — Standard Webhooks signature, then the order is read
 * back from Polar before anything is granted. Errors become a 5xx so Polar retries.
 */
export async function handlePolarWebhook(request: NextRequest) {
  const rawBody = await request.text()
  const signed = verifyPolarWebhookSignature({
    secret: (process.env.POLAR_WEBHOOK_SECRET || '').trim(),
    webhookId: request.headers.get('webhook-id'),
    webhookTimestamp: request.headers.get('webhook-timestamp'),
    webhookSignature: request.headers.get('webhook-signature'),
    rawBody,
  })
  if (!signed) return json({ error: 'invalid_signature' }, 401)
  let payload: { type?: unknown; data?: { id?: unknown } }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'invalid_notification' }, 400)
  }
  const type = typeof payload.type === 'string' ? payload.type : ''
  const orderId = typeof payload.data?.id === 'string' ? payload.data.id : null
  const eventId = await recordStoreEvent({
    platform: 'web',
    notificationType: type,
    notificationId: request.headers.get('webhook-id'),
    storeTransactionId: orderId,
    rawPayload: payload as Record<string, unknown>,
  })
  if (!eventId) return json({ ok: true, duplicate: true })

  let result = 'ignored'
  if (orderId && (type === 'order.paid' || type === 'order.refunded')) {
    try {
      result = await handlePolarOrderEvent(orderId)
    } catch (error) {
      // A definite refusal is final; anything else is retried by Polar.
      if (!(error instanceof IapVerificationError) || !CLIENT_ERROR_CODES.has(error.code)) throw error
      result = error.code
    }
  }
  await finishStoreEvent(eventId, result)
  return json({ ok: true })
}

async function recordStoreEvent(input: {
  platform: CoinProductPlatform
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
    if ((error as { code?: unknown } | null)?.code !== 'P2002' || !input.notificationId) throw error
    // Duplicate delivery. If the first delivery was stored but its processing failed
    // (the store retries after our 5xx), process it now; otherwise skip it.
    const existing = await prisma.appIapStoreEvent.findUnique({
      where: { notificationId: `${input.platform}:${input.notificationId}` },
      select: { id: true, processedAt: true },
    })
    return existing && !existing.processedAt ? existing.id : null
  }
}

async function finishStoreEvent(eventId: string, processResult: string) {
  await prisma.appIapStoreEvent.update({ where: { id: eventId }, data: { processedAt: new Date(), processResult } })
}

/** POST /webhooks/appstore — App Store Server Notifications V2. A thrown error becomes a 5xx, so the store retries. */
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
