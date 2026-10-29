/**
 * Chinese variant rules for post and comment translations (the rules of
 * main's normalizeChineseContent). Only the LLM call (translateTexts) is
 * faked; the OpenCC conversion and the variant resolution are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockTranslateTexts } = vi.hoisted(() => ({ mockTranslateTexts: vi.fn() }))

vi.mock('./translate-texts', () => ({ translateTexts: mockTranslateTexts }))

import {
  __testClearInFlightRequests,
  buildTranslationUserPrompt,
  DEFAULT_POST_TRANSLATION_LANGUAGES,
  normalizeRequestedTranslationLanguage,
  resolveDefaultPostTranslationLanguages,
  resolveEditTargetLanguages,
  retranslatePostOnEdit,
  translateCommentBodySettled,
  translateCommentOnDemand,
  translatePostBodySettled,
  translatePostOnDemand,
  translatePostOnPublish,
  type CommentTranslationRecord,
  type CommentTranslationRepository,
  type PostTranslationRecord,
  type PostTranslationRepository,
  type PostTranslationServiceDeps,
} from './post-translation-service'

// The same sentence per variant: OpenCC localizes 软件 <-> 軟體 both ways.
const SIMPLIFIED = '这个软件很好用'
const TAIWAN = '這個軟體很好用'
// Script-only conversions (words kept), for model answers in the wrong script.
const TAIWAN_IN_SIMPLIFIED_SCRIPT = '这个软体很好用'
const SIMPLIFIED_IN_TRADITIONAL_SCRIPT = '這個軟件很好用'
const ENGLISH = 'I love this app'

type TranslateCall = {
  text: string
  sourceLanguage: string
  targetLanguages: string[]
  systemPromptOverride?: string
  userPromptOverride?: string
}

/**
 * Model stub keyed by target language: a string is the answer, an Error is
 * thrown, a missing key answers nothing. `delayMs` delays that language.
 */
function modelAnswers(answers: Record<string, string | Error>, delayMs: Record<string, number> = {}) {
  mockTranslateTexts.mockImplementation(async ({ targetLanguages }: TranslateCall) => {
    const language = targetLanguages[0]
    if (delayMs[language]) await new Promise((resolve) => setTimeout(resolve, delayMs[language]))
    const answer = answers[language]
    if (answer instanceof Error) throw answer
    return { translations: answer === undefined ? {} : { [language]: answer }, provider: 'test', model: 'test' }
  })
}

const calls = (): TranslateCall[] => mockTranslateTexts.mock.calls.map(([input]) => input as TranslateCall)
const calledTargets = (): string[] => calls().map((call) => call.targetLanguages[0])

type Write = { language: string; bodyVersion: number; status: string }

function createPostRepo() {
  const records = new Map<string, PostTranslationRecord>()
  const writes: Write[] = []
  const key = (postId: string, bodyVersion: number, language: string) => `${postId}:${bodyVersion}:${language}`
  const repo: PostTranslationRepository = {
    async upsert(args) {
      const record = { ...args }
      records.set(key(args.postId, args.bodyVersion, args.language), record)
      writes.push({ language: args.language, bodyVersion: args.bodyVersion, status: args.status })
      return record
    },
    async upsertUnlessReady(args) {
      const current = records.get(key(args.postId, args.bodyVersion, args.language))
      if (current?.status === 'ready') return current
      return repo.upsert(args)
    },
    async findByPost(postId) {
      return [...records.values()].filter((r) => r.postId === postId)
    },
    async find(postId, bodyVersion, language) {
      return records.get(key(postId, bodyVersion, language)) ?? null
    },
    async findByPostVersion(postId, bodyVersion) {
      return [...records.values()].filter((r) => r.postId === postId && r.bodyVersion === bodyVersion)
    },
    async replaceVersionTranslations() {},
  }
  return { repo, records, writes, get: (bodyVersion: number, language: string) => records.get(key('post-1', bodyVersion, language)) }
}

function createCommentRepo() {
  const records = new Map<string, CommentTranslationRecord>()
  const key = (commentId: string, bodyVersion: number, language: string) => `${commentId}:${bodyVersion}:${language}`
  const repo: CommentTranslationRepository = {
    async upsert(args) {
      const record = { ...args }
      records.set(key(args.commentId, args.bodyVersion, args.language), record)
      return record
    },
    async upsertUnlessReady(args) {
      const current = records.get(key(args.commentId, args.bodyVersion, args.language))
      if (current?.status === 'ready') return current
      return repo.upsert(args)
    },
    async find(commentId, bodyVersion, language) {
      return records.get(key(commentId, bodyVersion, language)) ?? null
    },
    async findByCommentVersion(commentId, bodyVersion) {
      return [...records.values()].filter((r) => r.commentId === commentId && r.bodyVersion === bodyVersion)
    },
    async findByComment(commentId) {
      return [...records.values()].filter((r) => r.commentId === commentId)
    },
    async replaceVersionTranslations() {},
  }
  return { repo, records, get: (bodyVersion: number, language: string) => records.get(key('comment-1', bodyVersion, language)) }
}

function setup() {
  const posts = createPostRepo()
  const comments = createCommentRepo()
  const deps: PostTranslationServiceDeps = { postTranslationRepo: posts.repo, commentTranslationRepo: comments.repo }
  return { posts, comments, deps }
}

const rowsByLanguage = (rows: Array<{ language: string; status: string; text: string | null }>) =>
  Object.fromEntries(rows.map((row) => [row.language, { status: row.status, text: row.text }]))

beforeEach(() => {
  mockTranslateTexts.mockReset()
  __testClearInFlightRequests()
})

describe('rule 1: a Chinese source is zh-CN or zh-TW, never a bare zh', () => {
  it('filters the default targets by the variant of a bare zh source', () => {
    expect(resolveDefaultPostTranslationLanguages('zh', TAIWAN)).toEqual(['en', 'zh-CN', 'ja', 'ko'])
    expect(resolveDefaultPostTranslationLanguages('zh', SIMPLIFIED)).toEqual(['en', 'ja', 'ko'])
    expect(resolveDefaultPostTranslationLanguages('zh')).toEqual(['en', 'ja', 'ko'])
    expect(resolveDefaultPostTranslationLanguages('zh-TW')).toEqual(['en', 'zh-CN', 'ja', 'ko'])
    expect(resolveDefaultPostTranslationLanguages('zh-hant')).toEqual(['en', 'zh-CN', 'ja', 'ko'])
  })

  it('edit targets never include a bare zh key or the source variant', () => {
    const targets = resolveEditTargetLanguages('zh', ['zh', 'zh-TW', 'fr'], TAIWAN)
    expect(targets).toEqual(expect.arrayContaining(['zh-CN', 'fr', 'en', 'ja', 'ko']))
    expect(targets).toHaveLength(5)
    // Legacy keys become canonical; the zh-CN source drops its own variant.
    expect(resolveEditTargetLanguages('zh-CN', ['zh', 'zh-tw'])).toEqual(['zh-TW', 'en', 'ja', 'ko'])
  })

  it('translates a legacy bare zh source as its script variant', async () => {
    modelAnswers({ en: 'This software is great', ja: 'このソフトは使いやすい', ko: '이 소프트웨어 좋아요' })
    const rows = await translatePostBodySettled({
      sourceText: TAIWAN,
      sourceLanguage: 'zh',
      targetLanguages: resolveDefaultPostTranslationLanguages('zh', TAIWAN),
    })

    expect(rowsByLanguage(rows)['zh-CN']).toEqual({ status: 'ready', text: SIMPLIFIED })
    expect(calledTargets().sort()).toEqual(['en', 'ja', 'ko'])
    for (const call of calls()) {
      expect(call.sourceLanguage).toBe('zh-TW')
      expect(call.userPromptOverride?.split('\n')[0]).toBe('source="zh-TW"')
    }
  })
})

describe('rule 2: zh-CN text is Simplified and zh-TW text Traditional', () => {
  it('stores a zh-CN model answer written in Traditional characters in Simplified (settled)', async () => {
    modelAnswers({ 'zh-CN': TAIWAN })
    const rows = await translatePostBodySettled({ sourceText: ENGLISH, sourceLanguage: 'en', targetLanguages: ['zh-CN'] })
    expect(rows).toEqual([{ language: 'zh-CN', status: 'ready', text: TAIWAN_IN_SIMPLIFIED_SCRIPT }])
  })

  it('stores a zh-TW model answer written in Simplified characters in Traditional (on-demand)', async () => {
    const { posts, deps } = setup()
    modelAnswers({ 'zh-TW': SIMPLIFIED })
    const text = await translatePostOnDemand(deps, {
      postId: 'post-1', bodyVersion: 1, sourceText: ENGLISH, sourceLanguage: 'en', language: 'zh-TW',
    })
    expect(text).toBe(SIMPLIFIED_IN_TRADITIONAL_SCRIPT)
    expect(posts.get(1, 'zh-TW')).toMatchObject({ status: 'ready', text: SIMPLIFIED_IN_TRADITIONAL_SCRIPT })
  })

  it('stores a comment zh-CN answer in Simplified (on-demand)', async () => {
    const { comments, deps } = setup()
    modelAnswers({ 'zh-CN': TAIWAN })
    const text = await translateCommentOnDemand(deps, {
      commentId: 'comment-1', bodyVersion: 1, sourceText: ENGLISH, sourceLanguage: 'en', language: 'zh-CN',
    })
    expect(text).toBe(TAIWAN_IN_SIMPLIFIED_SCRIPT)
    expect(comments.get(1, 'zh-CN')).toMatchObject({ status: 'ready', text: TAIWAN_IN_SIMPLIFIED_SCRIPT })
  })
})

describe('rule 3: the other variant of a Chinese source is a conversion, not a model call', () => {
  it('publishing a zh-TW post converts zh-CN and calls the model only for the other languages', async () => {
    modelAnswers({ en: 'This software is great', ja: 'このソフトは使いやすい', ko: '이 소프트웨어 좋아요' })
    const rows = await translatePostBodySettled({
      sourceText: TAIWAN,
      sourceLanguage: 'zh-TW',
      targetLanguages: resolveDefaultPostTranslationLanguages('zh-TW'),
    })

    expect(rows.map((row) => row.language)).toEqual(['en', 'zh-CN', 'ja', 'ko'])
    expect(rowsByLanguage(rows)['zh-CN']).toEqual({ status: 'ready', text: SIMPLIFIED })
    expect(rowsByLanguage(rows).en).toEqual({ status: 'ready', text: 'This software is great' })
    expect(calledTargets().sort()).toEqual(['en', 'ja', 'ko'])
  })

  it('publishing through the repository converts too', async () => {
    const { posts, deps } = setup()
    modelAnswers({ en: 'This software is great', ja: 'このソフトは使いやすい', ko: '이 소프트웨어 좋아요' })
    const results = await translatePostOnPublish(deps, {
      postId: 'post-1', bodyVersion: 1, sourceText: TAIWAN, sourceLanguage: 'zh-TW',
    })

    expect(results['zh-CN']).toBe(SIMPLIFIED)
    expect(posts.get(1, 'zh-CN')).toMatchObject({ status: 'ready', text: SIMPLIFIED })
    expect(calledTargets()).not.toContain('zh-CN')
    expect(mockTranslateTexts).toHaveBeenCalledTimes(3)
  })

  it('on-demand zh-TW of a zh-CN post is converted through the usual pending -> ready row', async () => {
    const { posts, deps } = setup()
    const args = { postId: 'post-1', bodyVersion: 1, sourceText: SIMPLIFIED, sourceLanguage: 'zh-CN', language: 'zh-TW' }

    expect(await translatePostOnDemand(deps, args)).toBe(TAIWAN)
    expect(posts.writes).toEqual([
      { language: 'zh-TW', bodyVersion: 1, status: 'pending' },
      { language: 'zh-TW', bodyVersion: 1, status: 'ready' },
    ])
    // Second viewer: the stored row.
    expect(await translatePostOnDemand(deps, args)).toBe(TAIWAN)
    expect(posts.writes).toHaveLength(2)
    expect(mockTranslateTexts).not.toHaveBeenCalled()
  })

  it('a previously failed conversion target is retried as a conversion', async () => {
    const { posts, deps } = setup()
    await posts.repo.upsert({ postId: 'post-1', bodyVersion: 1, language: 'zh-TW', status: 'failed', text: null })
    const text = await translatePostOnDemand(deps, {
      postId: 'post-1', bodyVersion: 1, sourceText: SIMPLIFIED, sourceLanguage: 'zh-CN', language: 'zh-TW',
    })
    expect(text).toBe(TAIWAN)
    expect(posts.get(1, 'zh-TW')?.status).toBe('ready')
    expect(mockTranslateTexts).not.toHaveBeenCalled()
  })

  it('concurrent on-demand requests share one conversion', async () => {
    const { posts, deps } = setup()
    const args = { postId: 'post-1', bodyVersion: 1, sourceText: SIMPLIFIED, sourceLanguage: 'zh-CN', language: 'zh-TW' }
    const [first, second] = await Promise.all([translatePostOnDemand(deps, args), translatePostOnDemand(deps, args)])
    expect([first, second]).toEqual([TAIWAN, TAIWAN])
    expect(posts.writes.map((write) => write.status)).toEqual(['pending', 'ready'])
    expect(mockTranslateTexts).not.toHaveBeenCalled()
  })

  it('edit re-translation converts the other variant for the new body version only', async () => {
    const { posts, deps } = setup()
    await posts.repo.upsert({ postId: 'post-1', bodyVersion: 1, language: 'zh-TW', status: 'ready', text: '舊的內容' })
    await posts.repo.upsert({ postId: 'post-1', bodyVersion: 1, language: 'fr', status: 'ready', text: 'Ancien' })
    modelAnswers({ fr: 'Ce logiciel est super', en: 'This software is great', ja: 'このソフトは使いやすい', ko: '이 소프트웨어 좋아요' })

    const results = await retranslatePostOnEdit(deps, {
      postId: 'post-1', newBodyVersion: 2, sourceText: SIMPLIFIED, sourceLanguage: 'zh-CN',
    })

    expect(results['zh-TW']).toBe(TAIWAN)
    expect(posts.get(2, 'zh-TW')).toMatchObject({ status: 'ready', text: TAIWAN })
    expect(posts.get(1, 'zh-TW')).toMatchObject({ status: 'ready', text: '舊的內容' })
    expect(calledTargets().sort()).toEqual(['en', 'fr', 'ja', 'ko'])
  })

  it('the comment settled path converts the other variant with the comment prompt for the rest', async () => {
    modelAnswers({ en: 'This software is great', ja: 'このソフトは使いやすい', ko: '이 소프트웨어 좋아요' })
    const rows = await translateCommentBodySettled({
      sourceText: SIMPLIFIED,
      sourceLanguage: 'zh-CN',
      targetLanguages: resolveEditTargetLanguages('zh-CN', ['zh-TW']),
    })

    expect(rowsByLanguage(rows)['zh-TW']).toEqual({ status: 'ready', text: TAIWAN })
    expect(calledTargets().sort()).toEqual(['en', 'ja', 'ko'])
    expect(calls()[0].systemPromptOverride).toContain('social media comments')
  })

  it('comment on-demand zh-CN of a zh-TW comment is converted', async () => {
    const { comments, deps } = setup()
    const text = await translateCommentOnDemand(deps, {
      commentId: 'comment-1', bodyVersion: 1, sourceText: TAIWAN, sourceLanguage: 'zh-TW', language: 'zh-CN',
    })
    expect(text).toBe(SIMPLIFIED)
    expect(comments.get(1, 'zh-CN')).toMatchObject({ status: 'ready', text: SIMPLIFIED })
    expect(mockTranslateTexts).not.toHaveBeenCalled()
  })
})

describe('rule 4: a non-Chinese source falls back to the ready other variant', () => {
  it('on-demand zh-TW model failure with a ready zh-CN becomes the converted zh-CN', async () => {
    const { posts, deps } = setup()
    await posts.repo.upsert({ postId: 'post-1', bodyVersion: 1, language: 'zh-CN', status: 'ready', text: SIMPLIFIED })
    modelAnswers({ 'zh-TW': new Error('provider down') })

    const text = await translatePostOnDemand(deps, {
      postId: 'post-1', bodyVersion: 1, sourceText: ENGLISH, sourceLanguage: 'en', language: 'zh-TW',
    })
    expect(text).toBe(TAIWAN)
    expect(posts.get(1, 'zh-TW')).toMatchObject({ status: 'ready', text: TAIWAN })
    expect(mockTranslateTexts).toHaveBeenCalledTimes(1)
  })

  it('a model answer that copies the source untranslated is unusable', async () => {
    const { posts, deps } = setup()
    await posts.repo.upsert({ postId: 'post-1', bodyVersion: 1, language: 'zh-CN', status: 'ready', text: SIMPLIFIED })
    modelAnswers({ 'zh-TW': ` ${ENGLISH} ` })

    const text = await translatePostOnDemand(deps, {
      postId: 'post-1', bodyVersion: 1, sourceText: ENGLISH, sourceLanguage: 'en', language: 'zh-TW',
    })
    expect(text).toBe(TAIWAN)
    expect(posts.get(1, 'zh-TW')).toMatchObject({ status: 'ready', text: TAIWAN })
  })

  it('a usable model answer is kept even when the other variant is ready', async () => {
    const { posts, deps } = setup()
    await posts.repo.upsert({ postId: 'post-1', bodyVersion: 1, language: 'zh-CN', status: 'ready', text: SIMPLIFIED })
    modelAnswers({ 'zh-TW': '我超愛這個應用程式' })

    const text = await translatePostOnDemand(deps, {
      postId: 'post-1', bodyVersion: 1, sourceText: ENGLISH, sourceLanguage: 'en', language: 'zh-TW',
    })
    expect(text).toBe('我超愛這個應用程式')
  })

  it('only a ready other variant of the SAME body version counts', async () => {
    const { posts, deps } = setup()
    await posts.repo.upsert({ postId: 'post-1', bodyVersion: 1, language: 'zh-CN', status: 'ready', text: SIMPLIFIED })
    await posts.repo.upsert({ postId: 'post-1', bodyVersion: 2, language: 'zh-CN', status: 'pending', text: null })
    modelAnswers({ 'zh-TW': new Error('provider down') })

    const text = await translatePostOnDemand(deps, {
      postId: 'post-1', bodyVersion: 2, sourceText: ENGLISH, sourceLanguage: 'en', language: 'zh-TW',
    })
    expect(text).toBeNull()
    expect(posts.get(2, 'zh-TW')).toMatchObject({ status: 'failed', text: null })
  })

  it('without a ready other variant a failure stays failed and an untranslated answer is kept as today', async () => {
    const { posts, deps } = setup()
    modelAnswers({ 'zh-TW': new Error('provider down') })
    const args = { postId: 'post-1', bodyVersion: 1, sourceText: ENGLISH, sourceLanguage: 'en', language: 'zh-TW' }
    expect(await translatePostOnDemand(deps, args)).toBeNull()
    expect(posts.get(1, 'zh-TW')?.status).toBe('failed')

    // e.g. a brand name that stays the same in every language
    modelAnswers({ 'zh-TW': ENGLISH })
    expect(await translatePostOnDemand(deps, args)).toBe(ENGLISH)
    expect(posts.get(1, 'zh-TW')).toMatchObject({ status: 'ready', text: ENGLISH })
  })

  it('settled batch: a failed zh-TW takes the batch zh-CN row, converted', async () => {
    modelAnswers({ 'zh-CN': SIMPLIFIED, 'zh-TW': new Error('provider down'), ko: '이 앱 좋아요' })
    const rows = await translatePostBodySettled({
      sourceText: ENGLISH,
      sourceLanguage: 'fr',
      targetLanguages: ['zh-CN', 'zh-TW', 'ko'],
    })
    expect(rowsByLanguage(rows)).toEqual({
      'zh-CN': { status: 'ready', text: SIMPLIFIED },
      'zh-TW': { status: 'ready', text: TAIWAN },
      ko: { status: 'ready', text: '이 앱 좋아요' },
    })
  })

  it('settled batch: a Chinese row that missed the budget also takes the batch sibling', async () => {
    modelAnswers({ 'zh-CN': SIMPLIFIED, 'zh-TW': TAIWAN }, { 'zh-TW': 300 })
    const rows = await translatePostBodySettled({
      sourceText: ENGLISH,
      sourceLanguage: 'en',
      targetLanguages: ['zh-CN', 'zh-TW'],
      budgetMs: 50,
    })
    expect(rowsByLanguage(rows)['zh-TW']).toEqual({ status: 'ready', text: TAIWAN })
  })

  it('settled batch: both variants failing stay failed', async () => {
    modelAnswers({ 'zh-CN': new Error('down'), 'zh-TW': new Error('down') })
    const rows = await translatePostBodySettled({ sourceText: ENGLISH, sourceLanguage: 'en', targetLanguages: ['zh-CN', 'zh-TW'] })
    expect(rows).toEqual([
      { language: 'zh-CN', status: 'failed', text: null },
      { language: 'zh-TW', status: 'failed', text: null },
    ])
  })

  it('edit re-translation through the repository: a failed zh-TW takes the batch zh-CN', async () => {
    const { posts, deps } = setup()
    await posts.repo.upsert({ postId: 'post-1', bodyVersion: 1, language: 'zh-TW', status: 'ready', text: '舊的' })
    // zh-CN is still pending when zh-TW fails, so the batch pass must fill it.
    modelAnswers({ en: 'x', 'zh-CN': SIMPLIFIED, 'zh-TW': new Error('provider down'), ja: 'x', ko: 'x' }, { 'zh-CN': 30 })

    const results = await retranslatePostOnEdit(deps, {
      postId: 'post-1', newBodyVersion: 2, sourceText: ENGLISH, sourceLanguage: 'fr',
    })
    expect(results['zh-TW']).toBe(TAIWAN)
    expect(posts.get(2, 'zh-TW')).toMatchObject({ status: 'ready', text: TAIWAN })
    expect(posts.writes.filter((write) => write.language === 'zh-TW' && write.bodyVersion === 2).map((write) => write.status))
      .toEqual(['pending', 'failed', 'ready'])
  })

  it('comment on-demand zh-CN with nothing usable from the model takes the ready zh-TW', async () => {
    const { comments, deps } = setup()
    await comments.repo.upsert({ commentId: 'comment-1', bodyVersion: 1, language: 'zh-TW', status: 'ready', text: TAIWAN })
    modelAnswers({})

    const text = await translateCommentOnDemand(deps, {
      commentId: 'comment-1', bodyVersion: 1, sourceText: ENGLISH, sourceLanguage: 'en', language: 'zh-CN',
    })
    expect(text).toBe(SIMPLIFIED)
    expect(comments.get(1, 'zh-CN')).toMatchObject({ status: 'ready', text: SIMPLIFIED })
  })

  it('comment settled batch: an untranslated zh-CN takes the batch zh-TW, converted', async () => {
    modelAnswers({ 'zh-CN': ENGLISH, 'zh-TW': TAIWAN })
    const rows = await translateCommentBodySettled({
      sourceText: ENGLISH,
      sourceLanguage: 'en',
      targetLanguages: ['zh-CN', 'zh-TW'],
    })
    expect(rowsByLanguage(rows)).toEqual({
      'zh-CN': { status: 'ready', text: SIMPLIFIED },
      'zh-TW': { status: 'ready', text: TAIWAN },
    })
  })
})

describe('rule 5: a bare zh request is canonicalized, so no row is keyed zh', () => {
  it('normalizes requested languages', () => {
    expect(normalizeRequestedTranslationLanguage('zh')).toBe('zh-CN')
    expect(normalizeRequestedTranslationLanguage('zh-Hant')).toBe('zh-TW')
    expect(normalizeRequestedTranslationLanguage('zh-cn')).toBe('zh-CN')
    expect(normalizeRequestedTranslationLanguage('en')).toBe('en')
    expect(normalizeRequestedTranslationLanguage('qq')).toBe('')
  })

  it('a post on-demand zh request is stored under zh-CN', async () => {
    const { posts, deps } = setup()
    modelAnswers({ 'zh-CN': SIMPLIFIED })
    const text = await translatePostOnDemand(deps, {
      postId: 'post-1', bodyVersion: 1, sourceText: ENGLISH, sourceLanguage: 'en', language: 'zh',
    })
    expect(text).toBe(SIMPLIFIED)
    expect([...posts.records.values()].map((row) => row.language)).toEqual(['zh-CN'])
    expect(calledTargets()).toEqual(['zh-CN'])
  })

  it('a comment on-demand zh request is stored under zh-CN', async () => {
    const { comments, deps } = setup()
    modelAnswers({ 'zh-CN': SIMPLIFIED })
    await translateCommentOnDemand(deps, {
      commentId: 'comment-1', bodyVersion: 1, sourceText: ENGLISH, sourceLanguage: 'en', language: 'zh',
    })
    expect([...comments.records.values()].map((row) => row.language)).toEqual(['zh-CN'])
  })

  it('a bare zh target in a settled batch becomes zh-CN once', async () => {
    modelAnswers({ 'zh-CN': SIMPLIFIED })
    const rows = await translatePostBodySettled({ sourceText: ENGLISH, sourceLanguage: 'en', targetLanguages: ['zh', 'zh-CN'] })
    expect(rows).toEqual([{ language: 'zh-CN', status: 'ready', text: SIMPLIFIED }])
  })
})

describe('in-flight dedup', () => {
  it('concurrent zh-TW requests for an English post still make one model call', async () => {
    const { deps } = setup()
    modelAnswers({ 'zh-TW': TAIWAN }, { 'zh-TW': 30 })
    const args = { postId: 'post-1', bodyVersion: 1, sourceText: ENGLISH, sourceLanguage: 'en', language: 'zh-TW' }
    const [first, second] = await Promise.all([translatePostOnDemand(deps, args), translatePostOnDemand(deps, args)])
    expect([first, second]).toEqual([TAIWAN, TAIWAN])
    expect(mockTranslateTexts).toHaveBeenCalledTimes(1)
  })
})

describe('rule 6: nothing else changes', () => {
  it('keeps the default languages (zh-TW is not generated automatically)', () => {
    expect([...DEFAULT_POST_TRANSLATION_LANGUAGES]).toEqual(['en', 'zh-CN', 'ja', 'ko'])
    expect(resolveDefaultPostTranslationLanguages('en')).toEqual(['zh-CN', 'ja', 'ko'])
    expect(resolveDefaultPostTranslationLanguages('ko')).toEqual(['en', 'zh-CN', 'ja'])
  })

  it('stores non-Chinese answers exactly as the model returned them, with the same prompt', async () => {
    // Kanji a Japanese answer may share with Traditional Chinese are left alone.
    modelAnswers({ en: '  Hello\n\nworld ', ja: '這個軟體' })
    const rows = await translatePostBodySettled({ sourceText: '안녕\n\n세상', sourceLanguage: 'ko', targetLanguages: ['en', 'ja'] })

    expect(rowsByLanguage(rows)).toEqual({
      en: { status: 'ready', text: '  Hello\n\nworld ' },
      ja: { status: 'ready', text: '這個軟體' },
    })
    const jaCall = calls().find((call) => call.targetLanguages[0] === 'ja')
    expect(jaCall).toMatchObject({ text: '안녕\n\n세상', sourceLanguage: 'ko' })
    expect(jaCall?.userPromptOverride).toBe(buildTranslationUserPrompt('안녕\n\n세상', 'ko', ['ja']))
  })

  it('on-demand non-Chinese translation of a Chinese post is the model answer', async () => {
    const { posts, deps } = setup()
    modelAnswers({ ko: '이 소프트웨어 좋아요' })
    const text = await translatePostOnDemand(deps, {
      postId: 'post-1', bodyVersion: 1, sourceText: TAIWAN, sourceLanguage: 'zh-TW', language: 'ko',
    })
    expect(text).toBe('이 소프트웨어 좋아요')
    expect(posts.get(1, 'ko')).toMatchObject({ status: 'ready', text: '이 소프트웨어 좋아요' })
    expect(calls()[0]).toMatchObject({ sourceLanguage: 'zh-TW', targetLanguages: ['ko'] })
  })

  it('a non-Chinese target failure stays failed even when Chinese rows are ready', async () => {
    const { posts, deps } = setup()
    await posts.repo.upsert({ postId: 'post-1', bodyVersion: 1, language: 'zh-CN', status: 'ready', text: SIMPLIFIED })
    modelAnswers({ ja: new Error('provider down') })
    const text = await translatePostOnDemand(deps, {
      postId: 'post-1', bodyVersion: 1, sourceText: ENGLISH, sourceLanguage: 'en', language: 'ja',
    })
    expect(text).toBeNull()
    expect(posts.get(1, 'ja')?.status).toBe('failed')
  })
})
