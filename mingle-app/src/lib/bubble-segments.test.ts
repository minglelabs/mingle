import { describe, expect, it } from 'vitest'
import {
  appendSegmentTranslation,
  isBubbleSegmentPlanComplete,
  joinBubbleSegmentTranslations,
  joinSegmentTexts,
  parseBubbleSegments,
  planBubbleSegmentFill,
} from './bubble-segments'

describe('bubble segments', () => {
  it('joins segments with spaces except for unspaced scripts', () => {
    expect(joinSegmentTexts(['Hi.', ' How are you? '], 'en')).toBe('Hi. How are you?')
    expect(joinSegmentTexts(['こんにちは。', '元気？'], 'ja')).toBe('こんにちは。元気？')
    expect(joinSegmentTexts(['你好。', '', '再见。'], 'zh-TW')).toBe('你好。再见。')
  })

  it('plans the blank from the shortest fixed list across target languages', () => {
    const payload = parseBubbleSegments({
      sources: ['A.', 'B.', 'C.'],
      translations: { en: ['a.', 'b.'], ja: ['あ。'] },
    })!
    const plan = planBubbleSegmentFill(payload, ['en', 'ja'], 'ko')
    expect(plan.fixedCount).toBe(1)
    expect(plan.blankSourceText).toBe('B. C.')
    expect(plan.fixedTranslations).toEqual({ en: ['a.'], ja: ['あ。'] })
    expect(isBubbleSegmentPlanComplete(plan)).toBe(false)
    expect(joinBubbleSegmentTranslations(plan, { en: 'b. c.', ja: 'い。う。' }, ['en', 'ja']))
      .toEqual({ en: 'a. b. c.', ja: 'あ。い。う。' })
  })

  it('rejects payloads without usable sources', () => {
    expect(parseBubbleSegments(null)).toBeNull()
    expect(parseBubbleSegments({ sources: [] })).toBeNull()
    expect(parseBubbleSegments({ sources: ['ok', ''] })).toBeNull()
  })

  it('keeps fixed slots and pads a blank that covered several segments', () => {
    expect(appendSegmentTranslation(['a.'], 1, 3, 'b. c.')).toEqual(['a.', 'b. c.', ''])
    expect(appendSegmentTranslation(['a.', 'x.'], 1, 2, 'b.')).toEqual(['a.', 'b.'])
  })
})
