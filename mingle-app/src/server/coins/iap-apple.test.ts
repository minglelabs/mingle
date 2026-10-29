import { execFileSync } from 'node:child_process'
import { createHash, createPrivateKey, sign, X509Certificate } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { IapVerificationError, readAppleTransaction, verifyAppleJws, verifyAppleNotification } from './iap-apple'

// A throwaway P-256 chain (root -> intermediate -> leaf) made with the openssl
// CLI when the suite starts, so no key material lives in the repository. It
// stands in for Apple's chain: the production root fingerprint is replaced
// through the trustedRootSha256 option. Skipped where openssl is unavailable.
function generateChain(): { leaf: string; intermediate: string; root: string; leafKey: string } | null {
  const dir = mkdtempSync(join(tmpdir(), 'coin-iap-chain-'))
  const run = (args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' })
  const der = (name: string) => run(['x509', '-in', name, '-outform', 'DER']).toString('base64')
  try {
    writeFileSync(join(dir, 'ca.ext'), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign\n')
    for (const name of ['root', 'inter', 'leaf']) run(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${name}.key`])
    run(['req', '-x509', '-new', '-key', 'root.key', '-sha256', '-days', '30', '-subj', '/CN=Test Root CA',
      '-addext', 'basicConstraints=critical,CA:TRUE', '-out', 'root.pem'])
    run(['req', '-new', '-key', 'inter.key', '-subj', '/CN=Test Intermediate', '-out', 'inter.csr'])
    run(['x509', '-req', '-in', 'inter.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-days', '30',
      '-sha256', '-extfile', 'ca.ext', '-out', 'inter.pem'])
    run(['req', '-new', '-key', 'leaf.key', '-subj', '/CN=Test Leaf', '-out', 'leaf.csr'])
    run(['x509', '-req', '-in', 'leaf.csr', '-CA', 'inter.pem', '-CAkey', 'inter.key', '-CAcreateserial', '-days', '30',
      '-sha256', '-out', 'leaf.pem'])
    return {
      leaf: der('leaf.pem'),
      intermediate: der('inter.pem'),
      root: der('root.pem'),
      leafKey: run(['pkcs8', '-topk8', '-nocrypt', '-in', 'leaf.key']).toString('utf8'),
    }
  } catch {
    return null
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const chain = generateChain()
const LEAF_DER = chain?.leaf ?? ''
const INTERMEDIATE_DER = chain?.intermediate ?? ''
const ROOT_DER = chain?.root ?? ''
const LEAF_PRIVATE_KEY = chain?.leafKey ?? ''

const ROOT_SHA256 = chain ? createHash('sha256').update(new X509Certificate(Buffer.from(ROOT_DER, 'base64')).raw).digest('hex') : ''
const NOW = chain ? new Date(Date.parse(new X509Certificate(Buffer.from(LEAF_DER, 'base64')).validFrom) + 60_000) : new Date()
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
  productId: 'coin_3000',
  type: 'Consumable',
  environment: 'Sandbox',
  price: 4990,
  currency: 'USD',
  storefront: 'USA',
}

describe.skipIf(!chain)('verifyAppleJws', () => {
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
      storeProductId: 'coin_3000',
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

describe.skipIf(!chain)('verifyAppleNotification', () => {
  const previousRoot = process.env.APPLE_ROOT_CA_G3_SHA256
  afterEach(() => {
    process.env.APPLE_ROOT_CA_G3_SHA256 = previousRoot
  })

  it('verifies the outer notification and the transaction nested inside it', () => {
    // This path reads the trusted root from the environment and uses the real clock.
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
