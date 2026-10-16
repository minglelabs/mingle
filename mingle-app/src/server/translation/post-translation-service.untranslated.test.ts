import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGenerateContent = vi.fn()

vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAI {
    getGenerativeModel() {
      return { generateContent: mockGenerateContent }
    }
  }
  return {
    GoogleGenerativeAI,
    SchemaType: { BOOLEAN: 'BOOLEAN', STRING: 'STRING', OBJECT: 'OBJECT' },
  }
})

vi.mock('@/lib/app-analytics', () => {
  const sanitizeNonNegativeInt = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const floored = Math.floor(value)
      return floored >= 0 ? floored : null
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed)) return null
      return parsed >= 0 ? parsed : null
    }
    return null
  }
  return { sanitizeNonNegativeInt }
})

function setGeminiEnv() {
  process.env.TRANSLATE_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-key'
}

function clearEnv() {
  delete process.env.TRANSLATE_PROVIDER
  delete process.env.TRANSLATE_MODEL
  delete process.env.TRANSLATE_BASE_URL
  delete process.env.TRANSLATE_API_KEY
  delete process.env.GEMINI_API_KEY
  delete process.env.OPENAI_API_KEY
}

import type { PostTranslationRepository, CommentTranslationRepository, PostTranslationRecord, CommentTranslationRecord } from './post-translation-service'

function createMockPostRepo(): PostTranslationRepository & { records: Map<string, PostTranslationRecord> } {
  const records = new Map<string, PostTranslationRecord>()
  const key = (postId: string, bv: number, lang: string) => `${postId}:${bv}:${lang}`

  return {
    records,
    async upsert(args) {
      const record: PostTranslationRecord = {
        postId: args.postId,
        bodyVersion: args.bodyVersion,
        language: args.language,
        status: args.status,
        text: args.text,
      }
      records.set(key(args.postId, args.bodyVersion, args.language), record)
      return record
    },
    async findByPost(postId) {
      return Array.from(records.values()).filter((r) => r.postId === postId)
    },
    async find(postId, bodyVersion, language) {
      return records.get(key(postId, bodyVersion, language)) ?? null
    },
    async findByPostVersion(postId, bodyVersion) {
      return Array.from(records.values()).filter((r) => r.postId === postId && r.bodyVersion === bodyVersion)
    },
    async replaceVersionTranslations({ postId, bodyVersion, rows }) {
      for (const [k, v] of Array.from(records.entries())) {
        if (v.postId === postId && v.bodyVersion === bodyVersion) records.delete(k)
      }
      for (const r of rows) {
        records.set(key(postId, bodyVersion, r.language), {
          postId,
          bodyVersion,
          language: r.language,
          status: r.status,
          text: r.text,
        })
      }
    },
  }
}

function createMockCommentRepo(): CommentTranslationRepository & { records: Map<string, CommentTranslationRecord> } {
  const records = new Map<string, CommentTranslationRecord>()
  const key = (commentId: string, bv: number, lang: string) => `${commentId}:${bv}:${lang}`

  return {
    records,
    async upsert(args) {
      const record: CommentTranslationRecord = {
        commentId: args.commentId,
        bodyVersion: args.bodyVersion,
        language: args.language,
        status: args.status,
        text: args.text,
      }
      records.set(key(args.commentId, args.bodyVersion, args.language), record)
      return record
    },
    async find(commentId, bodyVersion, language) {
      return records.get(key(commentId, bodyVersion, language)) ?? null
    },
    async findByCommentVersion(commentId, bodyVersion) {
      return Array.from(records.values()).filter((r) => r.commentId === commentId && r.bodyVersion === bodyVersion)
    },
    async findByComment(commentId) {
      return Array.from(records.values()).filter((r) => r.commentId === commentId)
    },
    async replaceVersionTranslations({ commentId, bodyVersion, rows }) {
      for (const [k, v] of Array.from(records.entries())) {
        if (v.commentId === commentId && v.bodyVersion === bodyVersion) records.delete(k)
      }
      for (const r of rows) {
        records.set(key(commentId, bodyVersion, r.language), {
          commentId,
          bodyVersion,
          language: r.language,
          status: r.status,
          text: r.text,
        })
      }
    },
  }
}

function modelAnswer(language: string, text: string) {
  return { response: { text: () => JSON.stringify({ [language]: text }), usageMetadata: {}, candidates: [] } }
}

const ZH = '今晚又是公司楼下那家快餐店的生煎包，底都煎糊了。'

describe('untranslated copies of the source', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setGeminiEnv()
  })

  afterEach(() => {
    clearEnv()
  })

  it('asks again when the model hands the source back, and keeps the real translation', async () => {
    mockGenerateContent
      .mockResolvedValueOnce(modelAnswer('ko', ZH))
      .mockResolvedValueOnce(modelAnswer('ko', '오늘 밤도 회사 아래 그 패스트푸드점 생전포인데, 바닥이 다 탔어.'))
    const { translatePostOnDemand, __testClearInFlightRequests } = await import('./post-translation-service')
    __testClearInFlightRequests()
    const postRepo = createMockPostRepo()

    const text = await translatePostOnDemand(
      { postTranslationRepo: postRepo, commentTranslationRepo: createMockCommentRepo() },
      { postId: 'p1', bodyVersion: 1, sourceText: ZH, sourceLanguage: 'zh-CN', language: 'ko' },
    )

    expect(text).toBe('오늘 밤도 회사 아래 그 패스트푸드점 생전포인데, 바닥이 다 탔어.')
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    expect(postRepo.records.get('p1:1:ko')).toMatchObject({ status: 'ready', text })
  })

  it('stores failed, not a ready copy, when the model keeps copying', async () => {
    mockGenerateContent.mockResolvedValue(modelAnswer('ko', ZH))
    const { translatePostOnDemand, __testClearInFlightRequests } = await import('./post-translation-service')
    __testClearInFlightRequests()
    const postRepo = createMockPostRepo()

    const text = await translatePostOnDemand(
      { postTranslationRepo: postRepo, commentTranslationRepo: createMockCommentRepo() },
      { postId: 'p1', bodyVersion: 1, sourceText: ZH, sourceLanguage: 'zh-CN', language: 'ko' },
    )

    expect(text).toBeNull()
    expect(postRepo.records.get('p1:1:ko')).toMatchObject({ status: 'failed', text: null })
  })

  it('replaces a ready copy stored before the check', async () => {
    mockGenerateContent.mockResolvedValue(modelAnswer('ko', '오늘 밤도 생전포, 바닥이 탔어.'))
    const { translatePostOnDemand, __testClearInFlightRequests } = await import('./post-translation-service')
    __testClearInFlightRequests()
    const postRepo = createMockPostRepo()
    await postRepo.upsert({ postId: 'p1', bodyVersion: 1, language: 'ko', status: 'ready', text: ZH })

    const text = await translatePostOnDemand(
      { postTranslationRepo: postRepo, commentTranslationRepo: createMockCommentRepo() },
      { postId: 'p1', bodyVersion: 1, sourceText: ZH, sourceLanguage: 'zh-CN', language: 'ko' },
    )

    expect(text).toBe('오늘 밤도 생전포, 바닥이 탔어.')
    expect(postRepo.records.get('p1:1:ko')).toMatchObject({ status: 'ready', text })
  })

  it('replaces a ready comment copy too', async () => {
    const ko = '우유 마시면 덜 맵습니다 힘내요!'
    mockGenerateContent.mockResolvedValue(modelAnswer('ar', 'شرب الحليب يجعله أقل حرارة، تشجع!'))
    const { translateCommentOnDemand, __testClearInFlightRequests } = await import('./post-translation-service')
    __testClearInFlightRequests()
    const commentRepo = createMockCommentRepo()
    await commentRepo.upsert({ commentId: 'c1', bodyVersion: 1, language: 'ar', status: 'ready', text: ko })

    const text = await translateCommentOnDemand(
      { postTranslationRepo: createMockPostRepo(), commentTranslationRepo: commentRepo },
      { commentId: 'c1', bodyVersion: 1, sourceText: ko, sourceLanguage: 'ko', language: 'ar' },
    )

    expect(text).toBe('شرب الحليب يجعله أقل حرارة، تشجع!')
  })

  it('keeps a copy that is fine in the target language', async () => {
    mockGenerateContent.mockResolvedValue(modelAnswer('ko', 'OK'))
    const { translatePostOnDemand, __testClearInFlightRequests } = await import('./post-translation-service')
    __testClearInFlightRequests()

    const text = await translatePostOnDemand(
      { postTranslationRepo: createMockPostRepo(), commentTranslationRepo: createMockCommentRepo() },
      { postId: 'p2', bodyVersion: 1, sourceText: 'OK', sourceLanguage: 'en', language: 'ko' },
    )

    expect(text).toBe('OK')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })
})
