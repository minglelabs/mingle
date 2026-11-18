import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { voiceTalkCopy, type VoiceTalkCopy } from './voice-talk-copy'

describe('voiceTalkCopy', () => {
  it('translates every word in all 15 primary UI locales', () => {
    const keys = Object.keys(voiceTalkCopy('en')) as Array<keyof VoiceTalkCopy>
    for (const key of ['leave', 'me', 'empty', 'micOnState', 'interpretOnState', 'listenOnState', 'live', 'messageJoin', 'startTitle'] as const) {
      const values = new Set<string>()
      for (const locale of PRIMARY_UI_LOCALES) {
        const value = voiceTalkCopy(locale)[key]
        values.add(typeof value === 'function' ? value(2) : value)
      }
      // zh-CN and zh-TW may share a word ("我", "加入").
      expect(values.size, key).toBeGreaterThanOrEqual(13)
    }
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = voiceTalkCopy(locale)
      for (const key of keys) {
        const value = copy[key]
        const text = typeof value === 'function' ? value('Ana' as never) : value
        expect(text.trim(), `${locale}.${key}`).not.toBe('')
      }
      expect(copy.live(2), locale).toContain('2/8')
      expect(copy.startedBy('Ana'), locale).toContain('Ana')
    }
  })

  it('falls back to English, and finds regional tags', () => {
    expect(voiceTalkCopy('xx').leave).toBe('Leave')
    expect(voiceTalkCopy('ar-SA').leave).toBe('مغادرة')
    expect(voiceTalkCopy('ko-KR').micOnState).toBe('내 목소리 켜짐')
  })

  it('has both states of the interpret button in every language', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = voiceTalkCopy(locale)
      expect(copy.interpretOnState, locale).not.toBe(copy.interpretOffState)
    }
  })
})
