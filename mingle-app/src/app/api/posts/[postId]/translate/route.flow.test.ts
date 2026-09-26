/**
 * Route-level translation QA (checklist 51), with the REAL translation service
 * and an in-memory translation store; only the LLM call (translateTexts) and
 * the DB post lookup are faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Row = { postId: string; bodyVersion: number; language: string; status: 'pending' | 'ready' | 'failed'; text: string | null }

const h = vi.hoisted(() => ({
  session: { user: { id: 'viewer-a' } } as { user: { id: string } } | null,
  rows: new Map<string, Row>(),
  translateTexts: vi.fn(),
  post: { sourceText: '안녕하세요\n"반가워요"', sourceLanguage: 'ko', bodyVersion: 1 },
}))

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { post: { findFirst: async () => h.post, update: vi.fn() } },
}))
vi.mock('@/server/posts/post-visibility', () => ({
  visibleSinglePostWhere: (postId: string) => ({ id: postId }),
}))
vi.mock('@/server/translation/detect-source-language', () => ({ detectSourceLanguage: vi.fn() }))
vi.mock('@/server/translation/translate-texts', () => ({ translateTexts: h.translateTexts }))
vi.mock('@/server/translation/on-demand-translation-deps', () => {
  const key = (p: string, v: number, l: string) => `${p}:${v}:${l}`
  const postTranslationRepo = {
    async upsert(a: Row) {
      h.rows.set(key(a.postId, a.bodyVersion, a.language), { ...a })
      return { ...a }
    },
    async upsertUnlessReady(a: Row) {
      const k = key(a.postId, a.bodyVersion, a.language)
      const cur = h.rows.get(k)
      if (cur?.status === 'ready') return { ...cur }
      h.rows.set(k, { ...a })
      return { ...a }
    },
    async find(p: string, v: number, l: string) {
      return h.rows.get(key(p, v, l)) ?? null
    },
    async findByPost() { return [] },
    async findByPostVersion() { return [] },
    async replaceVersionTranslations() {},
  }
  return { onDemandTranslationDeps: { postTranslationRepo, commentTranslationRepo: {} } }
})

import { POST } from './route'
import { __resetRateLimitStore } from '@/server/rate-limit/rate-limit'
import { __testClearInFlightRequests } from '@/server/translation/post-translation-service'

const ctx = { params: Promise.resolve({ postId: 'p1' }) }
const req = (language: string) =>
  new NextRequest('http://localhost/api/posts/p1/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  })
const as = (userId: string) => {
  h.session = { user: { id: userId } }
}

describe('POST /api/posts/{postId}/translate — QA flow', () => {
  beforeEach(() => {
    h.rows.clear()
    h.translateTexts.mockReset()
    h.translateTexts.mockImplementation(async ({ targetLanguages }: { targetLanguages: string[] }) => ({
      translations: { [targetLanguages[0]]: `[${targetLanguages[0]}] hello` },
    }))
    __resetRateLimitStore()
    __testClearInFlightRequests()
    as('viewer-a')
  })

  it('a second viewer reuses the stored translation without calling the LLM', async () => {
    const first = await (await POST(req('ja'), ctx)).json()
    expect(first).toMatchObject({ status: 'ready', text: '[ja] hello' })
    expect(h.translateTexts).toHaveBeenCalledTimes(1)

    as('viewer-b')
    const second = await (await POST(req('ja'), ctx)).json()
    expect(second).toMatchObject({ status: 'ready', text: '[ja] hello' })
    expect(h.translateTexts).toHaveBeenCalledTimes(1)
  })

  it('changing the display language resolves to that language', async () => {
    await POST(req('ja'), ctx)
    const ko = await (await POST(req('en'), ctx)).json()
    expect(ko).toMatchObject({ language: 'en', text: '[en] hello' })
    expect(h.translateTexts).toHaveBeenLastCalledWith(expect.objectContaining({ targetLanguages: ['en'] }))
  })

  it('always returns the original, including when translation fails', async () => {
    h.translateTexts.mockRejectedValue(new Error('provider down'))
    const body = await (await POST(req('ja'), ctx)).json()
    expect(body).toMatchObject({
      status: 'failed',
      text: null,
      sourceText: h.post.sourceText,
      sourceLanguage: 'ko',
    })
  })

  it('stores a non-canonical request under the canonical key and reuses it', async () => {
    await POST(req('zh-cn'), ctx)
    expect([...h.rows.values()].map((r) => r.language)).toEqual(['zh-CN'])
    as('viewer-b')
    const body = await (await POST(req('zh-CN'), ctx)).json()
    expect(body).toMatchObject({ status: 'ready', text: '[zh-CN] hello' })
    expect(h.translateTexts).toHaveBeenCalledTimes(1)
  })

  it('passes the body to the model as a JSON string literal', async () => {
    await POST(req('ja'), ctx)
    const prompt: string = h.translateTexts.mock.calls[0][0].userPromptOverride
    const textLine = prompt.split('\n').find((l) => l.startsWith('text='))!
    expect(JSON.parse(textLine.slice('text='.length))).toBe(h.post.sourceText)
  })
})
