import { createHash, createPrivateKey, sign, X509Certificate } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { IapVerificationError, readAppleTransaction, verifyAppleJws, verifyAppleNotification } from './iap-apple'

// A throwaway P-256 chain (root -> intermediate -> leaf) generated with openssl
// for these tests only. It stands in for Apple's chain: the production root
// fingerprint is replaced through the trustedRootSha256 option.
const LEAF_DER = 'MIIBczCCARqgAwIBAgIUfJovxxq3S/CzESSJNkoG/3rVxGMwCgYIKoZIzj0EAwIwHDEaMBgGA1UEAwwRVGVzdCBJbnRlcm1lZGlhdGUwHhcNMjYxMDAyMTg0OTUzWhcNNDYwOTI3MTg0OTUzWjAUMRIwEAYDVQQDDAlUZXN0IExlYWYwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAR1sKKD+fFKDeN2LCDwr4ENwkiylOCVyuw2BfSR2SQt86lXgVzXn0YkxeVgWL/Dq62NPL03Wn0Lsx6ukFFYAROWo0IwQDAdBgNVHQ4EFgQUF1f5bxpt5Ooiv7rdPeR6Ykk/kXkwHwYDVR0jBBgwFoAUh5DXW+gHgw6yHswwBbIOvnxgtHQwCgYIKoZIzj0EAwIDRwAwRAIgSGT3P0KjWznL8HUPdbMHOP2amZfbVbS84z8Ch67T/GsCICziObSDvNUTQFDzFLhkezRfOxlfxgEfpwpvrVHo26K3'
const INTERMEDIATE_DER = 'MIIBmDCCAT6gAwIBAgIUUqDOQfkADs3ovZYUv8tT6WSti6YwCgYIKoZIzj0EAwIwFzEVMBMGA1UEAwwMVGVzdCBSb290IENBMB4XDTI2MTAwMjE4NDk1M1oXDTQ2MDkyNzE4NDk1M1owHDEaMBgGA1UEAwwRVGVzdCBJbnRlcm1lZGlhdGUwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQdVFlQgrczvA1iVgoz63AhhsdvD/Fyio85zj9l6wWOnXRXpIf9mMm7WGoGtS8Z3Y/8K94TDzawxJplUqRk/Lklo2MwYTAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwICBDAdBgNVHQ4EFgQUh5DXW+gHgw6yHswwBbIOvnxgtHQwHwYDVR0jBBgwFoAUm9wvSq+cRFficFLAjOufaFkT+v4wCgYIKoZIzj0EAwIDSAAwRQIhAND/yncu+1nKzVG8SO3pk9XUSY26OrnSU1O+uVTAYWjGAiBB7ZKwpaXFGX6Zo80wUZt5aOPKx7zYn9VXtC79O+O9zA=='
const ROOT_DER = 'MIIBgjCCASmgAwIBAgIUUkBgizJ3IhPdxu98l516Fv9mAoMwCgYIKoZIzj0EAwIwFzEVMBMGA1UEAwwMVGVzdCBSb290IENBMB4XDTI2MTAwMjE4NDk1M1oXDTQ2MDkyNzE4NDk1M1owFzEVMBMGA1UEAwwMVGVzdCBSb290IENBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtHmcMy7OwVZ88w3QYyI0Kb8ZVUL6DWN9IbijIacIN+gWaBQIxiwZrjoBtnW4ukElpfeFRGlD2eBpauAuU+1Zp6NTMFEwHQYDVR0OBBYEFJvcL0qvnERX4nBSwIzrn2hZE/r+MB8GA1UdIwQYMBaAFJvcL0qvnERX4nBSwIzrn2hZE/r+MA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDRwAwRAIgM3et06tumAlClqO5qRupohr41GYb3hBTQOmJVk4LUT0CIGTnrEUYSxBkSOMQE9uyNize3/wBYxzhWLX0aazm2xBm'
const LEAF_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQggaq8JmJmv/bL1Etb
SkRJn9CiBHjkhV+dSVIJdoaPeiWhRANCAAR1sKKD+fFKDeN2LCDwr4ENwkiylOCV
yuw2BfSR2SQt86lXgVzXn0YkxeVgWL/Dq62NPL03Wn0Lsx6ukFFYAROW
-----END PRIVATE KEY-----`

const ROOT_SHA256 = createHash('sha256').update(new X509Certificate(Buffer.from(ROOT_DER, 'base64')).raw).digest('hex')
const NOW = new Date(Date.parse(new X509Certificate(Buffer.from(LEAF_DER, 'base64')).validFrom) + 60_000)
const options = { now: NOW, trustedRootSha256: ROOT_SHA256 }

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function signJws(payload: Record<string, unknown>, x5c: string[] = [LEAF_DER, INTERMEDIATE_DER, ROOT_DER]): string {
  const signingInput = `${encode({ alg: 'ES256', x5c })}.${encode(payload)}`
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey(LEAF_PRIVATE_KEY),
    dsaEncoding: 'ieee-p1363',
  })
  return `${signingInput}.${signature.toString('base64url')}`
}

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return error instanceof IapVerificationError ? error.code : 'unexpected'
  }
  return 'no_error'
}

const transaction = {
  bundleId: 'com.minglelabs.mingle.rn',
  transactionId: '2000000123456789',
  originalTransactionId: '2000000123456789',
  productId: 'coin_5000',
  type: 'Consumable',
  environment: 'Sandbox',
  price: 4990,
  currency: 'USD',
  storefront: 'USA',
}

describe('verifyAppleJws', () => {
  it('returns the payload of a JWS signed by a chain that ends at the trusted root', () => {
    expect(verifyAppleJws(signJws(transaction), options)).toEqual(transaction)
  })

  it('rejects a payload changed after signing', () => {
    const [header, , signature] = signJws(transaction).split('.')
    const forged = `${header}.${encode({ ...transaction, productId: 'coin_30000' })}.${signature}`
    expect(codeOf(() => verifyAppleJws(forged, options))).toBe('invalid_jws_signature')
  })

  it('rejects a chain whose root is not the trusted one', () => {
    expect(codeOf(() => verifyAppleJws(signJws(transaction), { now: NOW }))).toBe('untrusted_certificate_root')
  })

  it('rejects a chain with a missing link, an expired certificate, or another algorithm', () => {
    expect(codeOf(() => verifyAppleJws(signJws(transaction, [LEAF_DER, ROOT_DER]), options))).toBe('invalid_certificate_chain')
    expect(codeOf(() => verifyAppleJws(signJws(transaction, [LEAF_DER]), options))).toBe('missing_certificate_chain')
    expect(codeOf(() => verifyAppleJws(signJws(transaction), { ...options, now: new Date('2099-01-01T00:00:00Z') }))).toBe('certificate_expired')
    const none = `${encode({ alg: 'none', x5c: [LEAF_DER, INTERMEDIATE_DER, ROOT_DER] })}.${encode(transaction)}.`
    expect(codeOf(() => verifyAppleJws(none, options))).toBe('unsupported_jws_alg')
    expect(codeOf(() => verifyAppleJws('not-a-jws', options))).toBe('invalid_jws')
  })
})

describe('readAppleTransaction', () => {
  it('maps a consumable transaction and stores the price in micros', () => {
    expect(readAppleTransaction(transaction)).toMatchObject({
      platform: 'ios',
      storeTransactionId: '2000000123456789',
      storeProductId: 'coin_5000',
      environment: 'sandbox',
      priceAmountMicros: 4_990_000n,
      priceCurrency: 'USD',
      storefrontCountry: 'USA',
    })
  })

  it('rejects another app, a revoked transaction and non-consumables', () => {
    expect(codeOf(() => readAppleTransaction({ ...transaction, bundleId: 'com.other.app' }))).toBe('bundle_mismatch')
    expect(codeOf(() => readAppleTransaction({ ...transaction, revocationDate: 1_700_000_000_000 }))).toBe('transaction_revoked')
    expect(codeOf(() => readAppleTransaction({ ...transaction, type: 'Auto-Renewable Subscription' }))).toBe('unsupported_product_type')
    expect(codeOf(() => readAppleTransaction({ ...transaction, transactionId: '' }))).toBe('invalid_transaction')
  })
})

describe('verifyAppleNotification', () => {
  const previousRoot = process.env.APPLE_ROOT_CA_G3_SHA256
  afterEach(() => {
    process.env.APPLE_ROOT_CA_G3_SHA256 = previousRoot
  })

  it('verifies the outer notification and the transaction nested inside it', () => {
    // This path reads the trusted root from the environment and uses the real clock;
    // the fixture chain is valid for 20 years from when it was generated.
    process.env.APPLE_ROOT_CA_G3_SHA256 = ROOT_SHA256
    const signedPayload = signJws({
      notificationType: 'REFUND',
      notificationUUID: 'uuid-1',
      data: { bundleId: 'com.minglelabs.mingle.rn', signedTransactionInfo: signJws(transaction) },
    })
    const notification = verifyAppleNotification(signedPayload)
    expect(notification.notificationType).toBe('REFUND')
    expect(notification.notificationUuid).toBe('uuid-1')
    expect(notification.transaction?.transactionId).toBe('2000000123456789')
  })
})
