import { describe, expect, it } from 'vitest'
import { HASH_RUSH_QUICK_CHAT, hashRushQuickChat } from './quick-chat'

describe('hash rush quick chat', () => {
  it('uses the game own lines without its swear word', () => {
    expect(hashRushQuickChat('ko')).toEqual([
      'ㄱㄱ', '잠만', 'ㅋㅋㅋ', 'ㅇㅋ', 'ㄴㄴ', 'ㅎㅇ', '굳굳 👍', 'ㄲㅂ', 'ㅈㅅ', 'ㄷㄷ', '한 판 더?', '팀 바꾸자', 'ㅂㅂ',
    ])
    for (const [language, lines] of Object.entries(HASH_RUSH_QUICK_CHAT)) {
      expect(lines, language).toHaveLength(13)
      expect(new Set(lines).size, language).toBe(13)
      for (const line of lines) expect(line.trim(), language).toBe(line)
    }
  })

  it('picks the language the way the game does', () => {
    expect(hashRushQuickChat('ko-KR')).toBe(HASH_RUSH_QUICK_CHAT.ko)
    expect(hashRushQuickChat('ja')).toBe(HASH_RUSH_QUICK_CHAT.ja)
    expect(hashRushQuickChat('zh-CN')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hans'])
    expect(hashRushQuickChat('zh')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hans'])
    expect(hashRushQuickChat('zh-TW')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hant'])
    expect(hashRushQuickChat('zh_HK')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hant'])
    expect(hashRushQuickChat('zh-Hant-TW')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hant'])
    expect(hashRushQuickChat('zh-Hans-TW')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hans'])
    for (const locale of ['en', 'en-US', 'fr', 'es', 'vi', 'th', '', 'xx']) {
      expect(hashRushQuickChat(locale), locale).toBe(HASH_RUSH_QUICK_CHAT.en)
    }
  })
})

