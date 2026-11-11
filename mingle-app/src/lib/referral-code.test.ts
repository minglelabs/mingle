import { describe, expect, it } from 'vitest'
import { fillReferralInviteMessage, generateReferralCode, normalizeReferralCode } from './referral-code'

describe('referral-code', () => {
  it('accepts 5 lower-case letters or digits, case- and space-insensitively', () => {
    expect(normalizeReferralCode(' Ab3dE ')).toBe('ab3de')
    expect(normalizeReferralCode('abcd')).toBeNull()
    expect(normalizeReferralCode('abcdef')).toBeNull()
    expect(normalizeReferralCode('ab-de')).toBeNull()
    expect(normalizeReferralCode(12345)).toBeNull()
  })

  it('generates valid codes without look-alike characters', () => {
    for (let index = 0; index < 500; index += 1) {
      const code = generateReferralCode()
      expect(normalizeReferralCode(code)).toBe(code)
      expect(code).not.toMatch(/[01oil]/)
    }
    expect(generateReferralCode(() => 0.999999)).toBe('99999')
    expect(generateReferralCode(() => 0)).toBe('aaaaa')
  })

  it('fills the invite message', () => {
    expect(fillReferralInviteMessage('{name}: code {code}, {coins} each. {link}', {
      name: 'Mina',
      code: 'ab3de',
      link: 'https://example.com/p/u1',
    })).toBe('Mina: code ab3de, 1,000 each. https://example.com/p/u1')
  })
})
