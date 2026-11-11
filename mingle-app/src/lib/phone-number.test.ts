import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  callingCodeOfE164,
  hashPhoneNumber,
  maskE164,
  normalizePhoneNumber,
  resolveDefaultPhoneCountry,
} from './phone-number'

describe('normalizePhoneNumber', () => {
  it('reads the local styles a Korean or Japanese address book holds', () => {
    for (const raw of ['010-1234-5678', '010 1234 5678', '01012345678', '+82 10-1234-5678', '+821012345678', '00821012345678', '821012345678']) {
      expect(normalizePhoneNumber(raw, '82'), raw).toBe('+821012345678')
    }
    expect(normalizePhoneNumber('090-1234-5678', '81')).toBe('+819012345678')
    expect(normalizePhoneNumber('+81 90 1234 5678', '82')).toBe('+819012345678')
  })

  it('handles countries without a trunk 0', () => {
    expect(normalizePhoneNumber('(201) 555-0123', '1')).toBe('+12015550123')
    expect(normalizePhoneNumber('8 912 345 67 89', '7')).toBe('+79123456789')
  })

  it('refuses what cannot be a phone number', () => {
    expect(normalizePhoneNumber('', '82')).toBeNull()
    expect(normalizePhoneNumber('112', '82')).toBeNull()
    expect(normalizePhoneNumber('010-1234-5678', null)).toBeNull()
    expect(normalizePhoneNumber('+0123456789', '82')).toBeNull()
  })
})

describe('phone helpers', () => {
  it('hashes like the server does', async () => {
    expect(await hashPhoneNumber('+821012345678')).toBe(createHash('sha256').update('+821012345678').digest('hex'))
  })

  it('finds the calling code and masks the middle', () => {
    expect(callingCodeOfE164('+821012345678')).toBe('82')
    expect(callingCodeOfE164('+886912345678')).toBe('886')
    expect(maskE164('+821012345678')).toBe('+82 ••••••5678')
  })

  it('preselects the country from the app language', () => {
    expect(resolveDefaultPhoneCountry('ko').callingCode).toBe('82')
    expect(resolveDefaultPhoneCountry('ja').callingCode).toBe('81')
    expect(resolveDefaultPhoneCountry('zh-TW').iso).toBe('TW')
    expect(resolveDefaultPhoneCountry('xx').iso).toBe('US')
  })
})
