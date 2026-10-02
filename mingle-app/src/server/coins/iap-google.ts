import { createSign } from 'node:crypto'
import { IapVerificationError, type VerifiedStorePurchase } from './iap-apple'

// Google Play Developer API (purchases.products). The service account JSON comes
// from GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (raw JSON or base64).

const DEFAULT_ANDROID_PACKAGE_NAME = 'com.minglelabs.mingle.rn'
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
const ANDROID_PUBLISHER_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const REQUEST_TIMEOUT_MS = 10_000

export function resolveAndroidPackageName(): string {
  return (process.env.ANDROID_IAP_PACKAGE_NAME || '').trim() || DEFAULT_ANDROID_PACKAGE_NAME
}

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string }

function readServiceAccount(): ServiceAccount {
  const raw = (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim()
  if (!raw) throw new IapVerificationError('google_play_not_configured')
  try {
    const parsed = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) as ServiceAccount
    if (!parsed.client_email || !parsed.private_key) throw new Error('incomplete')
    return parsed
  } catch {
    throw new IapVerificationError('google_play_not_configured')
  }
}

let cachedAccessToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60_000 > Date.now()) return cachedAccessToken.value
  const account = readServiceAccount()
  const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token'
  const issuedAt = Math.floor(Date.now() / 1000)
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: account.client_email,
    scope: ANDROID_PUBLISHER_SCOPE,
    aud: tokenUri,
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url')
  const response = await fetch(tokenUri, {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })
  if (!response.ok) throw new IapVerificationError('google_play_auth_failed')
  const body = await response.json() as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new IapVerificationError('google_play_auth_failed')
  cachedAccessToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 }
  return body.access_token
}

function productPurchaseUrl(storeProductId: string, purchaseToken: string): string {
  return `${ANDROID_PUBLISHER_BASE}/${encodeURIComponent(resolveAndroidPackageName())}`
    + `/purchases/products/${encodeURIComponent(storeProductId)}/tokens/${encodeURIComponent(purchaseToken)}`
}

/** purchases.products.get: the purchase must be in the PURCHASED state (0); pending (2) and cancelled (1) are rejected. */
export async function verifyGooglePlayPurchase(input: { storeProductId: string; purchaseToken: string }): Promise<VerifiedStorePurchase> {
  const storeProductId = input.storeProductId.trim()
  const purchaseToken = input.purchaseToken.trim()
  if (!storeProductId || !purchaseToken) throw new IapVerificationError('invalid_transaction')
  const response = await fetch(productPurchaseUrl(storeProductId, purchaseToken), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { authorization: `Bearer ${await getAccessToken()}` },
  })
  if (response.status === 404 || response.status === 400 || response.status === 410) {
    throw new IapVerificationError('invalid_transaction')
  }
  if (!response.ok) throw new IapVerificationError('google_play_unavailable')
  const body = await response.json() as Record<string, unknown>
  if (body.purchaseState === 2) throw new IapVerificationError('purchase_pending')
  if (body.purchaseState !== 0) throw new IapVerificationError('purchase_not_completed')
  return {
    platform: 'android',
    storeTransactionId: purchaseToken,
    storeOriginalTransactionId: typeof body.orderId === 'string' ? body.orderId : null,
    storeProductId,
    // purchaseType 0 = license tester / test purchase.
    environment: body.purchaseType === 0 ? 'sandbox' : 'production',
    priceAmountMicros: null,
    priceCurrency: null,
    storefrontCountry: typeof body.regionCode === 'string' ? body.regionCode : null,
    rawPayload: body,
  }
}

/** Marks the purchase consumed so the product can be bought again. Safe to repeat. */
export async function consumeGooglePlayPurchase(input: { storeProductId: string; purchaseToken: string }): Promise<boolean> {
  try {
    const response = await fetch(`${productPurchaseUrl(input.storeProductId, input.purchaseToken)}:consume`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { authorization: `Bearer ${await getAccessToken()}` },
    })
    return response.ok
  } catch {
    return false
  }
}

export type GooglePlayNotification = {
  notificationType: string
  messageId: string | null
  purchaseToken: string | null
  // true when the purchase was refunded, revoked or cancelled.
  voided: boolean
  rawPayload: Record<string, unknown>
}

/** Real-time developer notification delivered by a Pub/Sub push subscription. */
export function parseGooglePlayNotification(body: unknown): GooglePlayNotification | null {
  const message = (body as { message?: { data?: unknown; messageId?: unknown } } | null)?.message
  if (!message || typeof message.data !== 'string') return null
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
  if (payload.packageName && payload.packageName !== resolveAndroidPackageName()) return null
  const messageId = typeof message.messageId === 'string' ? message.messageId : null
  const voided = payload.voidedPurchaseNotification as { purchaseToken?: string } | undefined
  if (voided?.purchaseToken) {
    return { notificationType: 'voided_purchase', messageId, purchaseToken: voided.purchaseToken, voided: true, rawPayload: payload }
  }
  const oneTime = payload.oneTimeProductNotification as { purchaseToken?: string; notificationType?: number } | undefined
  if (oneTime?.purchaseToken) {
    // 1 = purchased, 2 = canceled (a pending purchase that never completed).
    return {
      notificationType: oneTime.notificationType === 2 ? 'one_time_canceled' : 'one_time_purchased',
      messageId,
      purchaseToken: oneTime.purchaseToken,
      voided: oneTime.notificationType === 2,
      rawPayload: payload,
    }
  }
  return { notificationType: payload.testNotification ? 'test' : 'other', messageId, purchaseToken: null, voided: false, rawPayload: payload }
}
