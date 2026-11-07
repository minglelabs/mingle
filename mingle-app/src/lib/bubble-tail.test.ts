import { describe, expect, it } from 'vitest'
import {
  extendFixedSource,
  isSafeInterimCut,
  joinTailTranslations,
  matchTranslatedTailLength,
  parseBubbleTail,
  planBubbleTail,
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
