import { describe, expect, it } from 'vitest'
import { HASH_RUSH_GAME_COPIES, hashRushGameCopy, type HashRushGameCopy } from './copy'

// Every value a copy can show, the counted ones with a sample number.
function words(copy: HashRushGameCopy): string[] {
  return Object.values(copy).map((value) => (typeof value === 'function' ? (value as (n: number) => string)(12) : value))
}

describe('hash rush app copy', () => {
  it('has every line in Korean, English and Japanese, and English for every other language', () => {
    const keys = Object.keys(HASH_RUSH_GAME_COPIES.en).sort()
    for (const [language, copy] of Object.entries(HASH_RUSH_GAME_COPIES)) {
      expect(Object.keys(copy).sort(), language).toEqual(keys)
      for (const line of words(copy)) {
        expect(line, language).toBeTruthy()
        expect(line, language).not.toContain('undefined')
      }
    }
    expect(hashRushGameCopy('fr-FR')).toBe(HASH_RUSH_GAME_COPIES.en)
    expect(hashRushGameCopy('ko-KR')).toBe(HASH_RUSH_GAME_COPIES.ko)
    expect(hashRushGameCopy('ja')).toBe(HASH_RUSH_GAME_COPIES.ja)
  })

  it('words the room as the server runs it: nobody hosts it, and rounds start by themselves', () => {
    for (const copy of Object.values(HASH_RUSH_GAME_COPIES)) {
      for (const line of words(copy)) expect(line).not.toMatch(/방장|host|ホスト/i)
    }
    expect(HASH_RUSH_GAME_COPIES.ko.nextRoundIn(15)).toBe('다음 판은 15초 뒤 자동으로 시작해요')
    expect(HASH_RUSH_GAME_COPIES.ko.startsIn(8)).toBe('⏱ 8초 뒤 시작')
    expect(HASH_RUSH_GAME_COPIES.en.botsFill(1)).toBe('A computer takes the empty seat')
    expect(HASH_RUSH_GAME_COPIES.en.botsFill(2)).toBe('2 computers take the empty seats')
  })

  it('keeps every line short', () => {
    // At most two lines on a phone card: about 40 characters, a little more in English.
    for (const [language, copy] of Object.entries(HASH_RUSH_GAME_COPIES)) {
      for (const line of words(copy)) expect(line.length, `${language}: ${line}`).toBeLessThanOrEqual(language === 'en' ? 60 : 40)
    }
  })
})
