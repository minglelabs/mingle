import { describe, expect, it } from 'vitest'
import {
  extendFixedSource,
  joinTailTranslations,
  matchTranslatedTailLength,
  parseBubbleTail,
  planBubbleTail,
  resolveBubbleTailAnswer,
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

describe('resolveBubbleTailAnswer', () => {
  const payload = {
    translatedSource: '안녕.',
    translations: { en: 'Hi.' },
    draftSource: '오늘',
    draftTranslations: { en: 'Today' },
  }

  it('fixes complete sentences and keeps the new draft rewritable', () => {
    const plan = planBubbleTail(payload, '안녕. 오늘 날씨가 좋다. 그래서 우리는', ['en'])!
    const resolved = resolveBubbleTailAnswer(plan, {
      fills: { en: 'The weather is nice today.' },
      translatedSource: '오늘 날씨가 좋다.',
      draft: { source: '그래서', translations: { en: 'So' } },
    }, ['en'], false)
    expect(resolved.translations).toEqual({ en: 'Hi. The weather is nice today. So' })
    expect(resolved.tailFill).toMatchObject({
      translatedSource: '안녕. 오늘 날씨가 좋다.',
      translations: { en: 'Hi. The weather is nice today.' },
      contextSource: '오늘 날씨가 좋다.',
      draftSource: '그래서',
    })
  })

  it('keeps the old draft when the answer has nothing usable', () => {
    const plan = planBubbleTail(payload, '안녕. 오늘 날씨가', ['en'])!
    const resolved = resolveBubbleTailAnswer(plan, { fills: {}, translatedSource: '', draft: null }, ['en'], false)
    expect(resolved.translations).toEqual({ en: 'Hi. Today' })
    expect(resolved.tailFill?.draftSource).toBe('오늘')
  })

  it('drops a draft that is not the start of the open part', () => {
    const plan = planBubbleTail(payload, '안녕. 오늘 날씨가', ['en'])!
    const resolved = resolveBubbleTailAnswer(plan, {
      fills: {}, translatedSource: '', draft: { source: '날씨가', translations: { en: 'weather' } },
    }, ['en'], false)
    expect(resolved.tailFill?.draftSource).toBe('오늘')
  })

  it('final answer replaces the draft with the full translation of the open part', () => {
    const plan = planBubbleTail(payload, '안녕. 오늘 날씨가 좋다', ['en'])!
    const resolved = resolveBubbleTailAnswer(plan, { fills: { en: 'The weather is nice today' }, translatedSource: '' }, ['en'], true)
    expect(resolved.translations).toEqual({ en: 'Hi. The weather is nice today' })
    expect(resolved.tailFill).toBeNull()
  })
})
