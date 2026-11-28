import { describe, expect, it } from 'vitest'
import {
  buildInterimTailPartialTranslations,
  extendFixedSource,
  isSafeInterimCut,
  isTailRestKey,
  joinTailDisplay,
  joinTailTranslations,
  matchTailCutAfter,
  parseBubbleTail,
  pickTailRests,
  planBubbleTail,
  shouldRequestInterimFill,
  tailRestKey,
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

  it('finds the cut from the last translated words, ignoring whitespace', () => {
    expect(matchTailCutAfter('잘 지내? 나는', '잘지내?')).toBe(5)
    expect(matchTailCutAfter('잘 지내? 나는', '지내?')).toBe(5)
    expect(matchTailCutAfter('I met him. Then we left, and', 'we left,')).toBe(24)
    expect(matchTailCutAfter('잘 지내? 나는', '너는')).toBe(-1)
    expect(matchTailCutAfter('잘 지내?', '')).toBe(0)
  })

  it('rejects last words that appear more than once', () => {
    expect(matchTailCutAfter('Yes. Yes. Okay so', 'Yes.')).toBe(-1)
    expect(matchTailCutAfter('Yes. Yes. Okay so', 'Yes. Yes.')).toBe(9)
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
  it('asks every 10 new characters, spaces included, in any script', () => {
    expect(shouldRequestInterimFill('same text', 'same text')).toBe(false)
    expect(shouldRequestInterimFill('', '')).toBe(false)
    // 9 new characters: not yet.
    expect(shouldRequestInterimFill('먼저 결과를 정리하고', '먼저')).toBe(false)
    // 10 new characters (with spaces).
    expect(shouldRequestInterimFill('먼저 결과를 정리하고,', '먼저')).toBe(true)
    expect(shouldRequestInterimFill('Hi there, h', 'Hi')).toBe(false)
    expect(shouldRequestInterimFill('Hi there, how ar', 'Hi')).toBe(true)
    expect(shouldRequestInterimFill('今日は天気がとても良いです', '今日は')).toBe(true)
  })
})

describe('buildInterimTailPartialTranslations', () => {
  const plan = planBubbleTail({ translatedSource: 'Hello.', translations: { ko: '안녕.' } }, 'Hello. Nice to meet you. And', ['ko'])!
  const key = 'cutAfter'

  it('waits until the answer has named its cut', () => {
    expect(buildInterimTailPartialTranslations(plan, { values: { [key]: 'Nice to', ko: '만나' }, complete: new Set() }, ['ko'], key)).toBeNull()
    expect(buildInterimTailPartialTranslations(plan, { values: { [key]: 'meet you.' }, complete: new Set([key]) }, ['ko'], key)).toBeNull()
    expect(buildInterimTailPartialTranslations(plan, { values: { [key]: 'Bye.', ko: '잘' }, complete: new Set([key]) }, ['ko'], key)).toBeNull()
  })

  it('shows the fixed part followed by the fill so far', () => {
    expect(buildInterimTailPartialTranslations(plan, {
      values: { [key]: 'meet you.', ko: '만나서 반' },
      complete: new Set([key]),
    }, ['ko'], key)).toEqual({ ko: '안녕. 만나서 반' })
  })

  it('adds the provisional rest after the fill', () => {
    expect(buildInterimTailPartialTranslations(plan, {
      values: { [key]: 'meet you.', ko: '만나서 반가워.', rest_ko: '그리고' },
      complete: new Set([key, 'ko']),
    }, ['ko'], key)).toEqual({ ko: '안녕. 만나서 반가워. 그리고' })
    // No cut yet: the fixed part and the rest.
    expect(buildInterimTailPartialTranslations(plan, {
      values: { [key]: '', ko: '', rest_ko: '만나서 반가워. 그리고' },
      complete: new Set([key, 'ko']),
    }, ['ko'], key)).toEqual({ ko: '안녕. 만나서 반가워. 그리고' })
  })
})

describe('tail rest helpers', () => {
  it('reads the rest per language and joins it for display', () => {
    expect(tailRestKey('en')).toBe('rest_en')
    expect(isTailRestKey('rest_en')).toBe(true)
    expect(isTailRestKey('en')).toBe(false)
    expect(pickTailRests({ rest_en: ' and then ', rest_ja: '', en: 'x' }, ['en', 'ja'])).toEqual({ en: 'and then' })
    expect(joinTailDisplay({ en: 'Hi.', ja: 'こんにちは。' }, { en: 'And', ja: 'それで' }, ['en', 'ja']))
      .toEqual({ en: 'Hi. And', ja: 'こんにちは。それで' })
  })
})
