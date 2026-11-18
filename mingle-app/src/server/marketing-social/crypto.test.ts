import { describe, expect, it } from 'vitest'
import { decryptToken, encryptToken, readTokenKey } from './crypto'

describe('marketing social token crypto', () => {
  const key = readTokenKey({ AUTH_SECRET: 'test-secret' })

  it('round-trips and never stores the plain token', () => {
    const sealed = encryptToken('IGQVJ-token-value', key)
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(sealed).not.toContain('IGQVJ')
    expect(decryptToken(sealed, key)).toBe('IGQVJ-token-value')
  })

  it('uses a fresh IV each time', () => {
    expect(encryptToken('same', key)).not.toBe(encryptToken('same', key))
  })

  it('rejects a tampered ciphertext or another key', () => {
    const sealed = encryptToken('secret', key)
    const parts = sealed.split('.')
    parts[3] = Buffer.from('xxxxxx').toString('base64url')
    expect(() => decryptToken(parts.join('.'), key)).toThrow()
    expect(() => decryptToken(sealed, readTokenKey({ AUTH_SECRET: 'other' }))).toThrow()
  })

  it('accepts a dedicated 32-byte hex or base64 key and refuses a short one', () => {
    expect(readTokenKey({ MARKETING_SOCIAL_TOKEN_KEY: 'ab'.repeat(32) })).toHaveLength(32)
    expect(readTokenKey({ MARKETING_SOCIAL_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64') })).toHaveLength(32)
    expect(() => readTokenKey({ MARKETING_SOCIAL_TOKEN_KEY: 'short' })).toThrow('marketing_social_token_key_invalid')
    expect(() => readTokenKey({})).toThrow('marketing_social_token_key_missing')
  })
})
