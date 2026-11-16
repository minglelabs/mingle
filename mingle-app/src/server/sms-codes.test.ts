import { afterEach, describe, expect, it } from 'vitest'
import {
  SMS_CODE_MAX_ATTEMPTS,
  SMS_CODE_TTL_MS,
  buildSmsCodeText,
  checkSmsCode,
  issueSmsCode,
  resetSmsCodes,
  toKoreanDomesticNumber,
} from './sms-codes'

afterEach(() => {
  resetSmsCodes()
})

it('sends Korean numbers in domestic form only', () => {
  expect(toKoreanDomesticNumber('+821012345678')).toBe('01012345678')
  expect(toKoreanDomesticNumber('+819012345678')).toBeNull()
})

describe('SMS codes', () => {
  it('takes the right code once', () => {
    const code = issueSmsCode('+821012345678', 0)
    expect(code).toMatch(/^\d{6}$/)
    expect(checkSmsCode('+821012345678', code, 1000)).toBe(true)
    expect(checkSmsCode('+821012345678', code, 1000)).toBe(false)
  })

  it('expires after five minutes', () => {
    const code = issueSmsCode('+821012345678', 0)
    expect(checkSmsCode('+821012345678', code, SMS_CODE_TTL_MS + 1)).toBe(false)
  })

  it('dies after too many wrong tries, even for the right code', () => {
    const code = issueSmsCode('+821012345678', 0)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < SMS_CODE_MAX_ATTEMPTS; i += 1) expect(checkSmsCode('+821012345678', wrong, 10)).toBe(false)
    expect(checkSmsCode('+821012345678', code, 10)).toBe(false)
  })

  it('keeps only the latest code for a number', () => {
    const first = issueSmsCode('+821012345678', 0)
    const second = issueSmsCode('+821012345678', 0)
    if (first !== second) expect(checkSmsCode('+821012345678', first, 1)).toBe(false)
    expect(checkSmsCode('+821012345678', second, 1)).toBe(true)
  })

  it('fits the code text in one SMS (90 bytes)', () => {
    const text = buildSmsCodeText('123456')
    const bytes = [...text].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0)
    expect(bytes).toBeLessThanOrEqual(90)
  })
})
