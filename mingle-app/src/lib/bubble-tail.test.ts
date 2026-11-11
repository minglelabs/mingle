import { describe, expect, it } from 'vitest'
import {
  buildInterimTailPartialTranslations,
  countInterimCutCandidates,
  extendFixedSource,
  isSafeInterimCut,
  joinTailTranslations,
  matchTranslatedTailLength,
  parseBubbleTail,
  planBubbleTail,
  resolveInterimFillFallbackChars,
  shouldRequestInterimFill,
} from './bubble-tail'

describe('bubble tail', () => {
  it('splits the text into the fixed part and the tail', () => {
    const plan = planBubbleTail(
      { translatedSource: '안녕.', translations: { en: 'Hi.' } },
      '안녕. 잘 지내?',
      ['en'],
    )
    expect(plan?.remainingSource).toBe('잘 지내?')
    expect(plan && extendFixedSource(plan, 5)).toBe('안녕. 잘 지내?')
    expect(plan && joinTailTranslations(plan, { en: 'How are you?' }, ['en'])).toEqual({ en: 'Hi. How are you?' })
  })

  it('falls back to a whole translation when a target has no fixed part', () => {
    expect(planBubbleTail({ translatedSource: '안녕.', translations: { en: 'Hi.' } }, '안녕. 잘 지내?', ['en', 'ja'])).toBeNull()
  })

  it('matches the translated part ignoring whitespace', () => {
    expect(matchTranslatedTailLength('잘 지내? 나는', '잘지내?')).toBe(5)
    expect(matchTranslatedTailLength('잘 지내? 나는', '나는')).toBe(-1)
    expect(matchTranslatedTailLength('잘 지내?', '')).toBe(0)
  })

  it('joins unspaced languages without a space', () => {
    const plan = planBubbleTail({ translatedSource: 'Hi.', translations: { ja: 'やあ。' } }, 'Hi. How are you?', ['ja'])
    expect(plan && joinTailTranslations(plan, { ja: '元気？' }, ['ja'])).toEqual({ ja: 'やあ。元気？' })
  })

  it('rejects a payload without translatedSource', () => {
    expect(parseBubbleTail({ translations: {} })).toBeNull()
  })
})

describe('isSafeInterimCut', () => {
  it('accepts a cut with words after it or ending in punctuation', () => {
    expect(isSafeInterimCut('it usually means, their work', 17)).toBe(true)
    expect(isSafeInterimCut('Yes.', 4)).toBe(true)
    expect(isSafeInterimCut('I think,', 8)).toBe(true)
  })

  it('rejects a cut at the very end of words just heard', () => {
    expect(isSafeInterimCut('it usually means their work', 27)).toBe(false)
    expect(isSafeInterimCut('anything', 0)).toBe(false)
  })
})

describe('previous bubble piece', () => {
  it('is context only while this bubble has nothing fixed', () => {
    const start = planBubbleTail({
      translatedSource: '', translations: {}, previousSource: 'So I tried again.', previousSourceLanguage: 'en', previousTranslations: { ko: '그래서 다시 해봤어.' },
    }, '근데 또 안 됐어', ['en'])!
    expect(start.previousSource).toBe('So I tried again.')
    expect(start.previousTranslations).toEqual({ en: 'So I tried again.' })

    const later = planBubbleTail({
      translatedSource: '근데', translations: { en: 'But' }, previousSource: 'So I tried again.', previousTranslations: {},
    }, '근데 또 안 됐어', ['en'])!
    expect(later.previousSource).toBe('')
  })
})

describe('interim fill gate', () => {
  it('counts marks with words after them and sentence ends', () => {
    expect(countInterimCutCandidates('I think, maybe')).toBe(1)
    expect(countInterimCutCandidates('I think,')).toBe(0)
    expect(countInterimCutCandidates('Yes.')).toBe(1)
    expect(countInterimCutCandidates('안녕하세요. 오늘은')).toBe(1)
    expect(countInterimCutCandidates('今日は天気が良いので、午後から')).toBe(1)
    expect(countInterimCutCandidates('it costs 3.5 dollars or 1,000 won')).toBe(0)
  })

  it('uses the shorter fallback for dense scripts, judged from the text', () => {
    expect(resolveInterimFillFallbackChars('오늘 회의에서는 다음 분기')).toBe(40)
    expect(resolveInterimFillFallbackChars('今日は天気がとても良い')).toBe(40)
    expect(resolveInterimFillFallbackChars('Today I want to talk about')).toBe(80)
    expect(resolveInterimFillFallbackChars('')).toBe(80)
  })

  it('asks on a new mark, or after the fallback stretch without one', () => {
    expect(shouldRequestInterimFill('먼저 결과를 정리하고, 그다음에', '먼저 결과를')).toBe(true)
    expect(shouldRequestInterimFill('먼저 결과를 정리하고', '먼저 결과를')).toBe(false)
    expect(shouldRequestInterimFill('same text', 'same text')).toBe(false)
    // Many marks close together: one request per stretch of new text, not per mark.
    expect(shouldRequestInterimFill('하... 그럼... 어', '하')).toBe(true)
    expect(shouldRequestInterimFill('하... 그럼', '하')).toBe(false)
    expect(shouldRequestInterimFill('Yes. No. Well, I', 'Yes')).toBe(false)
    expect(shouldRequestInterimFill('Yes. No. Well, I mean, maybe', 'Yes')).toBe(true)
    const korean = '가'.repeat(45)
    expect(shouldRequestInterimFill(korean, '가가가')).toBe(true)
    const english = 'word '.repeat(12).trim()
    expect(shouldRequestInterimFill(english, 'word')).toBe(false)
    expect(shouldRequestInterimFill('word '.repeat(18).trim(), 'word')).toBe(true)
  })
})

describe('buildInterimTailPartialTranslations', () => {
  const plan = planBubbleTail({ translatedSource: 'Hello.', translations: { ko: '안녕.' } }, 'Hello. Nice to meet you. And', ['ko'])!
  const key = 'translatedSource'

  it('waits until the answer names a cut the finished answer would keep', () => {
    expect(buildInterimTailPartialTranslations(plan, { values: { [key]: 'Nice to' }, complete: new Set() }, ['ko'], key)).toBeNull()
    expect(buildInterimTailPartialTranslations(plan, { values: { [key]: 'Bye.', ko: '잘' }, complete: new Set([key]) }, ['ko'], key)).toBeNull()
    expect(buildInterimTailPartialTranslations(plan, { values: { [key]: 'Nice to meet you.' }, complete: new Set([key]) }, ['ko'], key)).toBeNull()
  })

  it('shows the fixed part followed by the fill so far', () => {
    expect(buildInterimTailPartialTranslations(plan, {
      values: { [key]: 'Nice to meet you.', ko: '만나서 반' },
      complete: new Set([key]),
    }, ['ko'], key)).toEqual({ ko: '안녕. 만나서 반' })
  })
})
