import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(async () => ({ count: 1 })),
  detect: vi.fn(),
  convert: vi.fn(),
  translate: vi.fn(async () => []),
}))
vi.mock('@/lib/prisma', () => {
  const tx = {
    post: { updateMany: mocks.updateMany },
    postTranslation: { deleteMany: vi.fn(), createMany: vi.fn() },
  }
  return {
    prisma: {
      post: { findUnique: mocks.findUnique },
      postTranslation: { findMany: vi.fn(async () => []) },
      $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: vi.fn() }))
vi.mock('@/server/operator-post-reserve/post-image', () => ({ storeReservePostImage: vi.fn() }))
vi.mock('@/server/reports/moderation-service', () => ({ hidePostByModerator: vi.fn(), unhidePostByModerator: vi.fn() }))
vi.mock('@/server/translation/detect-source-language', () => ({ detectSourceLanguageVerdict: mocks.detect }))
vi.mock('@/server/translation/post-translation-service', () => ({ resolveEditTargetLanguages: () => ['en'], translatePostBodySettled: mocks.translate }))
vi.mock('@/server/operator-posts/convert', () => ({ convertToPersonaLanguage: mocks.convert }))

import { editOperatorPostText } from './edit'

const ctx = { sessionId: 's1' } as never

function post(sourceLanguage: string, primary: string) {
  return { id: 'p1', authorId: 'op1', bodyVersion: 1, sourceText: 'old', sourceLanguage, author: { isOperator: true, primaryLanguages: [primary] } }
}

describe('editOperatorPostText', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.convert.mockResolvedValue({ text: 'Ini yang ukuran L', language: 'id', converted: true, sourceLanguage: 'ko' })
  })

  it('saves Korean typed by staff in the persona language', async () => {
    mocks.findUnique.mockResolvedValue(post('id', 'id'))
    mocks.detect.mockResolvedValue({ language: 'ko', mixed: false })
    expect(await editOperatorPostText(ctx, 'p1', '이건 L 사이즈')).toEqual({ ok: true })
    expect(mocks.convert).toHaveBeenCalledWith({ operatorUserId: 'op1', text: '이건 L 사이즈' })
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceText: 'Ini yang ukuran L', sourceLanguage: 'id' }) }))
  })

  it('keeps Korean on a post the persona wrote in Korean, and text already in the persona language', async () => {
    mocks.findUnique.mockResolvedValue(post('ko', 'en'))
    mocks.detect.mockResolvedValue({ language: 'ko', mixed: false })
    await editOperatorPostText(ctx, 'p1', '빙수 맛있어요')
    mocks.findUnique.mockResolvedValue(post('id', 'id'))
    mocks.detect.mockResolvedValue({ language: 'id', mixed: false })
    await editOperatorPostText(ctx, 'p1', 'Ini yang ukuran M')
    expect(mocks.convert).not.toHaveBeenCalled()
  })
})
