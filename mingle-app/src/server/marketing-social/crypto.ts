import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM for the platform tokens kept in app_marketing_social_accounts.
 * Key: `MARKETING_SOCIAL_TOKEN_KEY` (32 bytes, base64 or hex), else derived
 * from `AUTH_SECRET` / `NEXTAUTH_SECRET` so a deployment works without a new
 * secret. Format: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 */
export function readTokenKey(env: Readonly<Record<string, string | undefined>> = process.env): Buffer {
  const raw = env.MARKETING_SOCIAL_TOKEN_KEY?.trim()
  if (raw) {
    const decoded = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
    if (decoded.length !== 32) throw new Error('marketing_social_token_key_invalid')
    return decoded
  }
  const secret = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim()
  if (!secret) throw new Error('marketing_social_token_key_missing')
  return createHash('sha256').update(`marketing-social-token:v1:${secret}`).digest()
}

export function encryptToken(plain: string, key: Buffer = readTokenKey()): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

export function decryptToken(sealed: string, key: Buffer = readTokenKey()): string {
  const [version, iv, tag, body] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || body === undefined) throw new Error('token_format_invalid')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
}
