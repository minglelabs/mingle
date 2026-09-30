import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ChatBubble, {
  buildTargetLanguagesForUtterance,
  createDisplayLanguageResolver,
  findDisplayTranslation,
  resolveOriginalDisplayLanguage,
  type Utterance,
} from './ChatBubble'
import { buildLatestUtterancePayload, buildNativePipMessage } from './LivePhoneDemo'

// Row numbers refer to the executed scenario matrix in the display audit.

function buildUtterance(overrides: Partial<Utterance>): Utterance {
  return {
    id: 'u-zh',
    originalText: '你好',
    originalLang: 'zh-CN',
    translations: {},
    ...overrides,
  }
}

function render(
  utterance: Utterance,
  options: { languageOrder?: string[], mode?: 'collapsed' | 'expanded', preferred?: string } = {},
) {
  return renderToStaticMarkup(createElement(ChatBubble, {
    utterance,
    uiLocale: 'en',
    languageOrder: options.languageOrder,
    preferredDisplayLanguage: options.preferred,
    bubbleDisplayMode: options.mode ?? 'collapsed',
  }))
}

function collapsedButtons(utterance: Utterance, languageOrder?: string[], preferred?: string) {
  const html = render(utterance, { languageOrder, preferred })
  return [...html.matchAll(/data-chat-language="([^"]+)" data-chat-language-role="([^"]+)"/g)]
    .map(([, language, role]) => (role === 'original' ? `${language}*` : language))
}

function expandedRows(utterance: Utterance, languageOrder?: string[]) {
  const html = render(utterance, { languageOrder, mode: 'expanded' })
  return [...html.matchAll(/data-expanded-bubble-content-wrapper="true" data-display-language="([^"]+)"/g)]
    .map(([, language]) => language)
}

function pip(utterance: Utterance, roomLanguageOrder: string[], defaultDisplayLanguage: string | null = null) {
  return buildNativePipMessage(utterance, {
    displayMode: 'expanded',
    defaultDisplayLanguage,
    roomLanguageOrder,
    isInterim: false,
  })
}

describe('ChatBubble Chinese variants', () => {
  it('row 7: folds a generic zh copy into a zh-CN original (canonical and legacy keys)', () => {
    for (const key of ['zh', 'zh-cn', 'zh-CN']) {
      const utterance = buildUtterance({
        targetLanguages: ['ko'],
        translations: { ko: '안녕', [key]: '你好' },
      })
      expect(expandedRows(utterance, ['ko', 'zh-CN'])).toEqual(['zh-CN', 'ko'])
      expect(collapsedButtons(utterance, ['ko', 'zh-CN'])).toEqual(['ko', 'zh-CN*'])
      const message = pip(utterance, ['ko', 'zh-CN'])
      expect(message.translations.map(({ language }) => language)).toEqual(['ko'])
    }
  })

  it('rows 8/10: a zh-TW original in a Traditional-only room shows no CN flag', () => {
    const utterance = buildUtterance({
      originalLang: 'zh-TW',
      originalText: '你們好',
      targetLanguages: ['ko'],
      translations: { ko: '안녕' },
    })
    expect(collapsedButtons(utterance, ['ko', 'zh-TW'])).toEqual(['ko', 'zh-TW*'])
    expect(expandedRows(utterance, ['ko', 'zh-TW'])).toEqual(['zh-TW', 'ko'])
    expect(render(utterance, { languageOrder: ['ko', 'zh-TW'], mode: 'expanded' })).not.toContain('zh-CN')
    const message = pip(utterance, ['ko', 'zh-TW'])
    expect(message.originalLanguage).toBe('zh-TW')
    expect(message.translations.map(({ language }) => language)).toEqual(['ko'])
  })

  it('row 9: a generic zh translation of a zh-CN original becomes the zh-TW row', () => {
    const utterance = buildUtterance({
      targetLanguages: ['ko', 'zh-TW'],
      translations: { ko: '안녕', zh: '你們好嗎' },
    })
    expect(expandedRows(utterance, ['ko', 'zh-TW'])).toEqual(['zh-CN', 'ko', 'zh-TW'])
    const html = render(utterance, { languageOrder: ['ko', 'zh-TW'], mode: 'expanded' })
    expect(html).toContain('你們好嗎')
    expect(pip(utterance, ['ko', 'zh-TW']).translations).toEqual([
      { language: 'ko', text: '안녕', isInterim: false },
      { language: 'zh-TW', text: '你們好嗎', isInterim: false },
    ])
  })

  it('row 12: one CN and one TW row when both variants are room languages', () => {
    const utterance = buildUtterance({
      targetLanguages: ['ko', 'zh-TW'],
      translations: { ko: '안녕', zh: '你們好' },
    })
    expect(expandedRows(utterance, ['ko', 'zh-CN', 'zh-TW'])).toEqual(['zh-CN', 'ko', 'zh-TW'])
    expect(collapsedButtons(utterance, ['ko', 'zh-CN', 'zh-TW'])).toEqual(['ko', 'zh-CN*', 'zh-TW'])
  })

  it('row 15: a zh-TW original with a generic zh translation has one CN row with text', () => {
    const utterance = buildUtterance({
      originalLang: 'zh-TW',
      originalText: '你們好',
      targetLanguages: ['ko', 'zh-CN'],
      translations: { ko: '안녕', zh: '你们好' },
    })
    expect(expandedRows(utterance, ['ko', 'zh-CN'])).toEqual(['zh-TW', 'ko', 'zh-CN'])
    const message = pip(utterance, ['ko', 'zh-CN'])
    expect(message.translations.map(({ language, text }) => [language, text])).toEqual([
      ['ko', '안녕'],
      ['zh-CN', '你们好'],
    ])
  })

  it('row 16: zh-CN and zh keys collapse into one row, preferring the finalized value', () => {
    const utterance = buildUtterance({
      originalLang: 'zh-TW',
      originalText: '你們好',
      targetLanguages: ['ko', 'zh-CN'],
      translations: { ko: '안녕', 'zh-CN': '你们', zh: '你们好' },
      translationFinalized: { ko: true, 'zh-CN': false, zh: true },
    })
    expect(expandedRows(utterance, ['ko', 'zh-CN', 'zh-TW'])).toEqual(['zh-TW', 'ko', 'zh-CN'])
    const resolver = createDisplayLanguageResolver(utterance, ['ko', 'zh-CN', 'zh-TW'])
    expect(findDisplayTranslation(utterance, 'zh-CN', resolver)).toEqual({ text: '你们好', finalized: true })
    expect(pip(utterance, ['ko', 'zh-CN', 'zh-TW']).translations).toHaveLength(2)
  })

  it('row 19: a Korean original keeps a zh translation reachable under the room CN flag', () => {
    const utterance = buildUtterance({
      originalLang: 'ko',
      originalText: '안녕',
      targetLanguages: ['zh-CN'],
      translations: { zh: '你好' },
    })
    expect(collapsedButtons(utterance, ['ko', 'zh-CN'])).toEqual(['ko*', 'zh-CN'])
    expect(expandedRows(utterance, ['ko', 'zh-CN'])).toEqual(['ko', 'zh-CN'])
    const html = render(utterance, { languageOrder: ['ko', 'zh-CN'], preferred: 'zh-CN' })
    expect(html).toContain('>你好<')
    expect(pip(utterance, ['ko', 'zh-CN'], 'zh-CN').text).toBe('안녕\n你好')
  })

  it('row 20: zh-CN and zh translations of a Korean original render one CN row', () => {
    const utterance = buildUtterance({
      originalLang: 'ko',
      originalText: '안녕',
      targetLanguages: ['zh-CN'],
      translations: { 'zh-CN': '你好', zh: '您好' },
    })
    expect(expandedRows(utterance, ['ko', 'zh-CN'])).toEqual(['ko', 'zh-CN'])
    expect(pip(utterance, ['ko', 'zh-CN']).translations).toEqual([
      { language: 'zh-CN', text: '您好', isInterim: false },
    ])
  })

  it('row 21: a zh translation in a Traditional-only room fills the TW flag', () => {
    const utterance = buildUtterance({
      originalLang: 'ko',
      originalText: '안녕',
      targetLanguages: ['zh-TW'],
      translations: { zh: '你好' },
    })
    expect(collapsedButtons(utterance, ['ko', 'zh-TW'])).toEqual(['ko*', 'zh-TW'])
    expect(expandedRows(utterance, ['ko', 'zh-TW'])).toEqual(['ko', 'zh-TW'])
    expect(pip(utterance, ['ko', 'zh-TW']).translations).toEqual([
      { language: 'zh-TW', text: '你好', isInterim: false },
    ])
  })

  it('rows 25/26: spectate (no room order) reaches a zh translation and shows one CN flag', () => {
    const single = buildUtterance({ originalLang: 'ko', originalText: '안녕', translations: { zh: '你好' } })
    expect(collapsedButtons(single)).toEqual(['ko*', 'zh-CN'])
    expect(render(single, { mode: 'expanded' })).toContain('>你好<')

    const both = buildUtterance({
      originalLang: 'ko', originalText: '안녕', translations: { 'zh-CN': '你好', zh: '您好' },
    })
    expect(collapsedButtons(both)).toEqual(['ko*', 'zh-CN'])
    expect(expandedRows(both)).toEqual(['ko', 'zh-CN'])
  })

  it('RC5: drops a Chinese room variant that is neither a target nor translated, keeps other room languages', () => {
    const utterance = buildUtterance({
      originalLang: 'ko',
      originalText: '안녕',
      targetLanguages: ['zh-CN'],
      translations: { 'zh-CN': '你好' },
    })
    expect(collapsedButtons(utterance, ['ko', 'zh-CN', 'zh-TW', 'ja'])).toEqual(['ko*', 'zh-CN', 'ja'])

    const targeted = { ...utterance, targetLanguages: ['zh-CN', 'zh-TW'] }
    expect(collapsedButtons(targeted, ['ko', 'zh-CN', 'zh-TW'])).toEqual(['ko*', 'zh-CN', 'zh-TW'])
  })

  it('RC1: never folds a generic zh translation into a non-Chinese original', () => {
    const resolver = createDisplayLanguageResolver(
      buildUtterance({ originalLang: 'ko', originalText: '안녕', translations: { zh: '你好' } }),
      ['ko', 'zh-CN'],
    )
    expect(resolver.keyOf('zh')).toBe('zh-cn')
    expect(resolver.keyOf('ko')).toBe('ko')
  })

  it('RC6: resolves a generic zh original from the room, then its text, instead of preferring CN', () => {
    expect(resolveOriginalDisplayLanguage('zh', [], ['ko', 'zh-TW'], '你好')).toBe('zh-TW')
    expect(resolveOriginalDisplayLanguage('zh', [], ['ko', 'zh-CN', 'zh-TW'], '這個問題')).toBe('zh-TW')
    expect(resolveOriginalDisplayLanguage('zh', [], ['ko', 'zh-CN', 'zh-TW'], '这个问题')).toBe('zh-CN')
    expect(resolveOriginalDisplayLanguage('zh-cn')).toBe('zh-CN')
    expect(resolveOriginalDisplayLanguage('ko', ['zh'])).toBe('ko')
  })

  it('spectate without languageOrder: a legacy zh original shows one flag and no duplicate', () => {
    const utterance = buildUtterance({
      originalLang: 'zh',
      originalText: '你好',
      targetLanguages: ['ko', 'zh-TW'],
      translations: { ko: '안녕', 'zh-TW': '你好' },
    })
    expect(collapsedButtons(utterance)).toEqual(['zh-TW*', 'ko'])
    expect(expandedRows(utterance)).toEqual(['zh-TW', 'ko'])
  })

  it('renders originalDisplayText for the original on every display surface', () => {
    const utterance = buildUtterance({
      originalLang: 'zh-TW',
      originalText: '你们好',
      originalDisplayText: '你們好',
      targetLanguages: ['ko'],
      translations: { ko: '안녕' },
    })
    const collapsed = render(utterance, { languageOrder: ['ko', 'zh-TW'], preferred: 'zh-TW' })
    expect(collapsed).toContain('你們好')
    expect(collapsed).not.toContain('你们好')
    const expanded = render(utterance, { languageOrder: ['ko', 'zh-TW'], mode: 'expanded' })
    expect(expanded).toContain('你們好')
    expect(expanded).not.toContain('你们好')

    const message = pip(utterance, ['ko', 'zh-TW'])
    expect(message.originalText).toBe('你們好')
    expect(message.text).toBe('你們好\n안녕')

    expect(buildLatestUtterancePayload(utterance, 'zh-TW', ['zh-TW'], null, ['ko', 'zh-TW'])?.preview).toBe('你們好')
  })

  it('latest preview finds a generic zh translation for a zh-TW viewer', () => {
    const utterance = buildUtterance({
      originalLang: 'ko',
      originalText: '안녕',
      targetLanguages: ['zh-TW'],
      translations: { zh: '你好' },
    })
    expect(buildLatestUtterancePayload(utterance, 'zh-TW', ['zh-TW'], null, ['ko', 'zh-TW'])?.preview).toBe('你好')
  })

  it('keeps the same-language bubble of mixed-language speech for explicit originals', () => {
    const korean = buildUtterance({
      originalText: 'そんな답답해서',
      originalLang: 'ko',
      sourceLanguagesMixed: true,
      targetLanguages: ['ko', 'ja'],
      translations: { ko: '그렇게 답답해서', ja: 'そんなに' },
    })
    expect(buildTargetLanguagesForUtterance(korean, ['ko', 'ja'])).toEqual(['ko', 'ja'])

    const chinese = buildUtterance({
      originalText: '我们去 한국 식당',
      originalLang: 'zh-CN',
      sourceTextHasForeignScript: true,
      targetLanguages: ['zh-CN', 'ko'],
      translations: { 'zh-CN': '我们去韩国餐厅', ko: '한국 식당 가자' },
    })
    expect(buildTargetLanguagesForUtterance(chinese, ['zh-CN', 'ko'])).toEqual(['zh-CN', 'ko'])
  })

  it('drops copies of a legacy generic zh original even for mixed-language speech', () => {
    const utterance = buildUtterance({
      originalText: '我们去 한국 식당',
      originalLang: 'zh',
      sourceLanguagesMixed: true,
      targetLanguages: ['ko'],
      translations: { zh: '我们去 한국 식당', ko: '한국 식당 가자' },
    })
    expect(buildTargetLanguagesForUtterance(utterance, ['ko', 'zh-CN'])).toEqual(['ko'])
  })
})
