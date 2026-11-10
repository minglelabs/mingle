/**
 * Bodies that mix languages (detection's sourceLanguagesMixed): translated
 * into every default language, their own main language included. Only the
 * LLM call (translateTexts) is faked; Chinese conversion is real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockTranslateTexts } = vi.hoisted(() => ({ mockTranslateTexts: vi.fn() }))

vi.mock('./translate-texts', () => ({ translateTexts: mockTranslateTexts }))

import {
  __testClearInFlightRequests,
  DEFAULT_POST_TRANSLATION_LANGUAGES,
  resolveDefaultPostTranslationLanguages,
  resolveEditTargetLanguages,
  translateCommentBodySettled,
  translatePostBodySettled,
} from './post-translation-service'

type TranslateCall = { targetLanguages: string[]; systemPromptOverride?: string }

function modelAnswers(answers: Record<string, string>) {
  mockTranslateTexts.mockImplementation(async ({ targetLanguages }: TranslateCall) => {
    const language = targetLanguages[0]
    const answer = answers[language]
    return { translations: answer === undefined ? {} : { [language]: answer }, provider: 'test', model: 'test' }
  })
}

function promptFor(language: string): string {
  const call = mockTranslateTexts.mock.calls.find(([input]) => (input as TranslateCall).targetLanguages[0] === language)
  return (call?.[0] as TranslateCall | undefined)?.systemPromptOverride ?? ''
}

describe('mixed-language bodies', () => {
  beforeEach(() => {
    mockTranslateTexts.mockReset()
    __testClearInFlightRequests()
  })

  it('targets every default language, the source included', () => {
    expect(resolveDefaultPostTranslationLanguages('ko', null, true)).toEqual([...DEFAULT_POST_TRANSLATION_LANGUAGES])
    expect(resolveDefaultPostTranslationLanguages('ko')).not.toContain('ko')
  })

  it('keeps the source language on edit only when the body is mixed', () => {
    expect(resolveEditTargetLanguages('ko', ['fr'], null, true)).toEqual(expect.arrayContaining(['ko', 'en', 'ja', 'zh-CN', 'fr']))
    expect(resolveEditTargetLanguages('ko', ['fr', 'ko'])).not.toContain('ko')
  })

  it('translates a mixed Korean post into Korean with the mixed rule', async () => {
    const source = '오늘 meeting 진짜 long했어'
    modelAnswers({ ko: '오늘 회의 진짜 길었어', en: 'The meeting was really long today' })

    const rows = await translatePostBodySettled({
      sourceText: source,
      sourceLanguage: 'ko',
      targetLanguages: ['ko', 'en'],
      sourceLanguagesMixed: true,
    })

    expect(rows).toEqual(expect.arrayContaining([
      { language: 'ko', status: 'ready', text: '오늘 회의 진짜 길었어' },
      { language: 'en', status: 'ready', text: 'The meeting was really long today' },
    ]))
    expect(promptFor('ko')).toContain('The text mixes languages.')
    expect(promptFor('en')).toContain('The text mixes languages.')
  })

  it('leaves the mixed rule out of a body that does not mix languages', async () => {
    modelAnswers({ en: 'Hello' })
    await translateCommentBodySettled({ sourceText: '안녕하세요', sourceLanguage: 'ko', targetLanguages: ['en'] })
    expect(promptFor('en')).not.toContain('The text mixes languages.')
  })

  it('converts zh-TW from the fully Chinese zh-CN rendering of a mixed zh-CN body', async () => {
    // "这个 app 很好用" mixed; the model renders it fully in Chinese as 这个软件很好用.
    modelAnswers({ 'zh-CN': '这个软件很好用' })

    const rows = await translatePostBodySettled({
      sourceText: '这个 app 很好用',
      sourceLanguage: 'zh-CN',
      targetLanguages: ['zh-TW'],
      sourceLanguagesMixed: true,
    })

    expect(rows).toEqual([{ language: 'zh-TW', status: 'ready', text: '這個軟體很好用' }])
    expect(mockTranslateTexts.mock.calls.map(([input]) => (input as TranslateCall).targetLanguages[0])).toEqual(['zh-CN'])
  })

  it('still converts zh-TW straight from a zh-CN body that does not mix languages', async () => {
    const rows = await translatePostBodySettled({ sourceText: '这个软件很好用', sourceLanguage: 'zh-CN', targetLanguages: ['zh-TW'] })
    expect(rows).toEqual([{ language: 'zh-TW', status: 'ready', text: '這個軟體很好用' }])
    expect(mockTranslateTexts).not.toHaveBeenCalled()
  })
})
