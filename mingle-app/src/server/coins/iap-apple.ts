import { createHash, verify as verifySignature, X509Certificate } from 'node:crypto'

// StoreKit 2 signed transactions and App Store Server Notifications V2 are JWS
// (ES256) with the signing chain in the x5c header. We verify the chain up to
// Apple Root CA - G3 and the signature locally; nothing the client says about
// product or amount is trusted (docs/coin-iap-spec.md 6.3).

// SHA-256 fingerprint of "Apple Root CA - G3" (https://www.apple.com/certificateauthority/).
const APPLE_ROOT_CA_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179'
const DEFAULT_IOS_BUNDLE_ID = 'com.minglelabs.mingle.rn'

export class IapVerificationError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

export function resolveIosBundleId(): string {
  return (process.env.IOS_IAP_BUNDLE_ID || '').trim() || DEFAULT_IOS_BUNDLE_ID
}

function trustedRootFingerprint(): string {
  return ((process.env.APPLE_ROOT_CA_G3_SHA256 || '').trim() || APPLE_ROOT_CA_G3_SHA256)
    .replace(/[^0-9a-f]/gi, '')
    .toLowerCase()
}

function decodeJsonSegment(segment: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new IapVerificationError('invalid_jws')
  return parsed as Record<string, unknown>
}

/** Verifies an Apple-signed JWS and returns its payload. Throws IapVerificationError otherwise. */
export function verifyAppleJws(
  jws: string,
  options: { now?: Date; trustedRootSha256?: string } = {},
): Record<string, unknown> {
  const parts = typeof jws === 'string' ? jws.trim().split('.') : []
  if (parts.length !== 3) throw new IapVerificationError('invalid_jws')
  let header: Record<string, unknown>
  let payload: Record<string, unknown>
  try {
    header = decodeJsonSegment(parts[0])
    payload = decodeJsonSegment(parts[1])
  } catch {
    throw new IapVerificationError('invalid_jws')
  }
  if (header.alg !== 'ES256') throw new IapVerificationError('unsupported_jws_alg')
  const x5c = Array.isArray(header.x5c) ? header.x5c.filter((entry): entry is string => typeof entry === 'string') : []
  if (x5c.length < 2) throw new IapVerificationError('missing_certificate_chain')

  let chain: X509Certificate[]
  try {
    chain = x5c.map(entry => new X509Certificate(Buffer.from(entry, 'base64')))
  } catch {
    throw new IapVerificationError('invalid_certificate_chain')
  }
  const now = (options.now ?? new Date()).getTime()
  for (let index = 0; index < chain.length; index += 1) {
    const certificate = chain[index]
    if (now < Date.parse(certificate.validFrom) || now > Date.parse(certificate.validTo)) {
      throw new IapVerificationError('certificate_expired')
    }
    const issuer = chain[index + 1]
    if (issuer && !certificate.verify(issuer.publicKey)) throw new IapVerificationError('invalid_certificate_chain')
  }
  const root = chain[chain.length - 1]
  const rootFingerprint = createHash('sha256').update(root.raw).digest('hex')
  const trusted = (options.trustedRootSha256 ?? trustedRootFingerprint()).toLowerCase()
  if (rootFingerprint !== trusted || !root.verify(root.publicKey)) {
    throw new IapVerificationError('untrusted_certificate_root')
  }

  const signatureValid = verifySignature(
    'sha256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    { key: chain[0].publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(parts[2], 'base64url'),
  )
  if (!signatureValid) throw new IapVerificationError('invalid_jws_signature')
  return payload
}

export type VerifiedStorePurchase = {
  platform: 'ios' | 'android'
  storeTransactionId: string
  storeOriginalTransactionId: string | null
  storeProductId: string
  environment: 'sandbox' | 'production'
  priceAmountMicros: bigint | null
  priceCurrency: string | null
  storefrontCountry: string | null
  rawPayload: Record<string, unknown>
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

/** Maps a verified signedTransactionInfo payload to a purchase; rejects foreign bundles and revoked transactions. */
export function readAppleTransaction(payload: Record<string, unknown>): VerifiedStorePurchase {
  if (readString(payload.bundleId) !== resolveIosBundleId()) throw new IapVerificationError('bundle_mismatch')
  const storeTransactionId = readString(payload.transactionId)
  const storeProductId = readString(payload.productId)
  if (!storeTransactionId || !storeProductId) throw new IapVerificationError('invalid_transaction')
  if (payload.revocationDate) throw new IapVerificationError('transaction_revoked')
  if (payload.type && payload.type !== 'Consumable') throw new IapVerificationError('unsupported_product_type')
  // Apple reports price in milliunits of the currency; store it as micros like Google.
  const price = typeof payload.price === 'number' && Number.isFinite(payload.price) ? BigInt(Math.round(payload.price)) * 1000n : null
  return {
    platform: 'ios',
    storeTransactionId,
    storeOriginalTransactionId: readString(payload.originalTransactionId) || null,
    storeProductId,
    environment: readString(payload.environment).toLowerCase() === 'production' ? 'production' : 'sandbox',
    priceAmountMicros: price,
    priceCurrency: readString(payload.currency) || null,
    storefrontCountry: readString(payload.storefront) || null,
    rawPayload: payload,
  }
}

export function verifyAppleTransactionJws(jws: string): VerifiedStorePurchase {
  return readAppleTransaction(verifyAppleJws(jws))
}

export type AppleNotification = {
  notificationType: string
  subtype: string | null
  notificationUuid: string | null
  transaction: Record<string, unknown> | null
  rawPayload: Record<string, unknown>
}

/** App Store Server Notifications V2: { signedPayload } whose data.signedTransactionInfo is itself a JWS. */
export function verifyAppleNotification(signedPayload: string): AppleNotification {
  const payload = verifyAppleJws(signedPayload)
  const data = typeof payload.data === 'object' && payload.data !== null ? payload.data as Record<string, unknown> : {}
  if (data.bundleId && readString(data.bundleId) !== resolveIosBundleId()) throw new IapVerificationError('bundle_mismatch')
  const signedTransactionInfo = readString(data.signedTransactionInfo)
  return {
    notificationType: readString(payload.notificationType),
    subtype: readString(payload.subtype) || null,
    notificationUuid: readString(payload.notificationUUID) || null,
    transaction: signedTransactionInfo ? verifyAppleJws(signedTransactionInfo) : null,
    rawPayload: payload,
  }
}
