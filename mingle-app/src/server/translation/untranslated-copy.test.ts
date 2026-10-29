import { describe, expect, it } from 'vitest'
import { isUntranslatedCopy } from './untranslated-copy'

describe('isUntranslatedCopy', () => {
  it('flags a copy written in a script the target does not use', () => {
    const zh = '今晚又是公司楼下那家快餐店的生煎包，底都煎糊了。'
    expect(isUntranslatedCopy(zh, 'ko', zh)).toBe(true)
    expect(isUntranslatedCopy(zh, 'en', ` ${zh} `)).toBe(true)
    const ko = '은 는 이 가 차이 아직도 모르겠습니다 너무 헷갈려요'
    expect(isUntranslatedCopy(ko, 'ja', ko)).toBe(true)
    expect(isUntranslatedCopy(ko, 'ar', ko)).toBe(true)
  })

  it('accepts text that differs from the source', () => {
    expect(isUntranslatedCopy('今晚吃生煎包', 'ko', '오늘 밤은 생전포')).toBe(false)
  })

  it('accepts copies that are fine in the target language', () => {
    expect(isUntranslatedCopy('OK', 'ko', 'OK')).toBe(false)
    expect(isUntranslatedCopy('👍👍', 'ja', '👍👍')).toBe(false)
    expect(isUntranslatedCopy('2026', 'th', '2026')).toBe(false)
    // mostly English with a Korean phrase being taught: already English
    const mixed = '"잠시만요" (jamsimanyo) works as "excuse me" when you need to pass someone'
    expect(isUntranslatedCopy(mixed, 'en', mixed)).toBe(false)
  })

  it('never flags targets without a script table', () => {
    expect(isUntranslatedCopy('안녕하세요', 'xx', '안녕하세요')).toBe(false)
  })

  it('handles empty values', () => {
    expect(isUntranslatedCopy('', 'ko', '')).toBe(false)
    expect(isUntranslatedCopy('안녕', 'en', null)).toBe(false)
  })
})
