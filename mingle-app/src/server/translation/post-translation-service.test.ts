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
  }
}

describe('post-translation-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setGeminiEnv()
  })

  afterEach(() => {
    clearEnv()
  })

  describe('resolveDefaultPostTranslationLanguages()', () => {
    it('excludes source language from defaults', async () => {
      const { resolveDefaultPostTranslationLanguages } = await import('./post-translation-service')
      expect(resolveDefaultPostTranslationLanguages('ko')).toEqual(['en', 'zh-CN', 'ja'])
      expect(resolveDefaultPostTranslationLanguages('en')).toEqual(['zh-CN', 'ja', 'ko'])
      expect(resolveDefaultPostTranslationLanguages('ja')).toEqual(['en', 'zh-CN', 'ko'])
      expect(resolveDefaultPostTranslationLanguages('fr')).toEqual(['en', 'zh-CN', 'ja', 'ko'])
    })
  })

  describe('translatePostOnPublish()', () => {
    it('translates to all default languages except source', async () => {
      mockGenerateContent.mockImplementation(async () => ({
        response: {
          text: () => JSON.stringify({ en: 'Hello' }),
          usageMetadata: {},
          candidates: [],
        },
      }))

      const { translatePostOnPublish, __testClearInFlightRequests } = await import('./post-translation-service')
      __testClearInFlightRequests()

      const postRepo = createMockPostRepo()
      const commentRepo = createMockCommentRepo()

      const results = await translatePostOnPublish(
        { postTranslationRepo: postRepo, commentTranslationRepo: commentRepo },
        {
          postId: 'post-1',
          bodyVersion: 1,
          sourceText: '안녕하세요',
          sourceLanguage: 'ko',
        },
      )

      // Should target en, zh-CN, ja (ko excluded)
      expect(Object.keys(results)).toHaveLength(3)
      expect(results.en).toBe('Hello')
      // zh-CN and ja will also be attempted (mock returns 'en' key only so they'll be null)
      expect(mockGenerateContent).toHaveBeenCalledTimes(3)
    })

    it('marks failed translations as failed status', async () => {
      mockGenerateContent.mockRejectedValue(new Error('provider down'))

      const { translatePostOnPublish, __testClearInFlightRequests } = await import('./post-translation-service')
      __testClearInFlightRequests()

      const postRepo = createMockPostRepo()
      const commentRepo = createMockCommentRepo()

      const results = await translatePostOnPublish(
        { postTranslationRepo: postRepo, commentTranslationRepo: commentRepo },
        {
          postId: 'post-1',
          bodyVersion: 1,
          sourceText: '안녕하세요',
          sourceLanguage: 'ko',
        },
      )

      expect(results.en).toBeNull()
      const record = await postRepo.find('post-1', 1, 'en')
      expect(record?.status).toBe('failed')
    })
  })

  describe('translatePostOnDemand()', () => {
    it('returns cached translation if already ready', async () => {
      const { translatePostOnDemand, __testClearInFlightRequests } = await import('./post-translation-service')
      __testClearInFlightRequests()

      const postRepo = createMockPostRepo()
      const commentRepo = createMockCommentRepo()

      // Seed a ready translation
      await postRepo.upsert({
        postId: 'post-1',
        bodyVersion: 1,
        language: 'en',
        status: 'ready',
        text: 'Hello',
      })

      const result = await translatePostOnDemand(
        { postTranslationRepo: postRepo, commentTranslationRepo: commentRepo },
        {
          postId: 'post-1',
          bodyVersion: 1,
          sourceText: '안녕하세요',
          sourceLanguage: 'ko',
          language: 'en',
        },
      )

      expect(result).toBe('Hello')
      expect(mockGenerateContent).not.toHaveBeenCalled()
    })

    it('retries if previous translation failed', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ en: 'Hello' }),
          usageMetadata: {},
          candidates: [],
        },
      })

      const { translatePostOnDemand, __testClearInFlightRequests } = await import('./post-translation-service')
      __testClearInFlightRequests()

      const postRepo = createMockPostRepo()
      const commentRepo = createMockCommentRepo()

      // Seed a failed translation
      await postRepo.upsert({
        postId: 'post-1',
        bodyVersion: 1,
        language: 'en',
        status: 'failed',
        text: null,
      })

      const result = await translatePostOnDemand(
        { postTranslationRepo: postRepo, commentTranslationRepo: commentRepo },
        {
          postId: 'post-1',
          bodyVersion: 1,
          sourceText: '안녕하세요',
          sourceLanguage: 'ko',
          language: 'en',
        },
      )

      expect(result).toBe('Hello')
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
      const record = await postRepo.find('post-1', 1, 'en')
      expect(record?.status).toBe('ready')
      expect(record?.text).toBe('Hello')
    })
  })

  describe('retranslatePostOnEdit()', () => {
    it('retranslates default languages plus previously translated languages', async () => {
      mockGenerateContent.mockImplementation(async () => ({
        response: {
          text: () => JSON.stringify({ en: 'Updated' }),
          usageMetadata: {},
          candidates: [],
        },
      }))

      const { retranslatePostOnEdit, __testClearInFlightRequests } = await import('./post-translation-service')
      __testClearInFlightRequests()

      const postRepo = createMockPostRepo()
      const commentRepo = createMockCommentRepo()

      // Seed previous translations (v1) including 'fr' which is not in defaults
      await postRepo.upsert({ postId: 'post-1', bodyVersion: 1, language: 'en', status: 'ready', text: 'Old' })
      await postRepo.upsert({ postId: 'post-1', bodyVersion: 1, language: 'fr', status: 'ready', text: 'Ancien' })

      const results = await retranslatePostOnEdit(
        { postTranslationRepo: postRepo, commentTranslationRepo: commentRepo },
        {
          postId: 'post-1',
          newBodyVersion: 2,
          sourceText: '수정된 글',
          sourceLanguage: 'ko',
        },
      )

      // Should include: en, zh-CN, ja (defaults minus ko) + fr (previously existed)
      expect(Object.keys(results)).toContain('en')
      expect(Object.keys(results)).toContain('fr')
      expect(Object.keys(results)).toContain('zh-CN')
      expect(Object.keys(results)).toContain('ja')
      // 4 languages total
      expect(Object.keys(results)).toHaveLength(4)
    })
  })

  describe('translateCommentOnDemand()', () => {
    it('translates a comment on demand', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ en: 'Nice post!' }),
          usageMetadata: {},
          candidates: [],
        },
      })

      const { translateCommentOnDemand, __testClearInFlightRequests } = await import('./post-translation-service')
      __testClearInFlightRequests()

      const postRepo = createMockPostRepo()
      const commentRepo = createMockCommentRepo()

      const result = await translateCommentOnDemand(
        { postTranslationRepo: postRepo, commentTranslationRepo: commentRepo },
        {
          commentId: 'comment-1',
          bodyVersion: 1,
          sourceText: '좋은 글이네요!',
          sourceLanguage: 'ko',
          language: 'en',
        },
      )

      expect(result).toBe('Nice post!')
      const record = await commentRepo.find('comment-1', 1, 'en')
      expect(record?.status).toBe('ready')
      expect(record?.text).toBe('Nice post!')
    })

    it('returns cached comment translation if already ready', async () => {
      const { translateCommentOnDemand, __testClearInFlightRequests } = await import('./post-translation-service')
      __testClearInFlightRequests()

      const postRepo = createMockPostRepo()
      const commentRepo = createMockCommentRepo()

      await commentRepo.upsert({
        commentId: 'comment-1',
        bodyVersion: 1,
        language: 'en',
        status: 'ready',
        text: 'Cached translation',
      })

      const result = await translateCommentOnDemand(
        { postTranslationRepo: postRepo, commentTranslationRepo: commentRepo },
        {
          commentId: 'comment-1',
          bodyVersion: 1,
          sourceText: '원문',
          sourceLanguage: 'ko',
          language: 'en',
        },
      )

      expect(result).toBe('Cached translation')
      expect(mockGenerateContent).not.toHaveBeenCalled()
    })
  })

  describe('in-flight dedup', () => {
    it('shares promise for same post+version+language', async () => {
      let callCount = 0
      mockGenerateContent.mockImplementation(async () => {
        callCount++
        // Simulate some latency
        await new Promise((resolve) => setTimeout(resolve, 50))
        return {
          response: {
            text: () => JSON.stringify({ en: 'Hello' }),
            usageMetadata: {},
            candidates: [],
          },
        }
      })

      const { translatePostOnDemand, __testClearInFlightRequests } = await import('./post-translation-service')
      __testClearInFlightRequests()

      const postRepo = createMockPostRepo()
      const commentRepo = createMockCommentRepo()
      const deps = { postTranslationRepo: postRepo, commentTranslationRepo: commentRepo }
      const args = {
        postId: 'post-1',
        bodyVersion: 1,
        sourceText: '안녕하세요',
        sourceLanguage: 'ko',
        language: 'en',
      }

      // Start two concurrent requests without awaiting
      const [result1, result2] = await Promise.all([
        translatePostOnDemand(deps, args),
        translatePostOnDemand(deps, args),
      ])

      expect(result1).toBe('Hello')
      expect(result2).toBe('Hello')
      // Provider should only be called once due to dedup
      expect(callCount).toBe(1)
    })
  })
})
