import { describe, expect, it } from 'vitest'
import { captionTooLong, composeCaption, normalizeHashtags } from './captions'

describe('captions', () => {
  it('normalizes hashtags', () => {
    expect(normalizeHashtags('#HashChat, 통번역  ##번역앱 #hashchat #a-b')).toEqual(['#HashChat', '#통번역', '#번역앱', '#ab'])
    expect(normalizeHashtags(['#a', 'b'])).toEqual(['#a', '#b'])
    expect(normalizeHashtags(null)).toEqual([])
  })

  it('appends hashtags; Threads keeps one topic tag', () => {
    expect(composeCaption('instagram', ' 말하면 바로 번역 ', ['#a', '#b'])).toBe('말하면 바로 번역\n\n#a #b')
    expect(composeCaption('threads', '말하면 바로 번역', ['#a', '#b'])).toBe('말하면 바로 번역\n\n#a')
    expect(composeCaption('tiktok', '', ['#a'])).toBe('#a')
  })

  it('caps to the platform limit and counts by characters', () => {
    expect(composeCaption('threads', 'x'.repeat(600), [])).toHaveLength(500)
    expect(captionTooLong('threads', '가'.repeat(500))).toBe(false)
    expect(captionTooLong('threads', '가'.repeat(501))).toBe(true)
  })
})
