import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  postCreateMany: vi.fn(),
  postUpdateMany: vi.fn(),
  postFindUnique: vi.fn(),
  commentCreateMany: vi.fn(),
  commentUpdateMany: vi.fn(),
  commentFindUnique: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    postTranslation: { createMany: m.postCreateMany, updateMany: m.postUpdateMany, findUnique: m.postFindUnique },
    postCommentTranslation: {
      createMany: m.commentCreateMany,
      updateMany: m.commentUpdateMany,
      findUnique: m.commentFindUnique,
    },
  },
}))
vi.mock('@/server/posts/post-translation-repository', () => ({
  prismaTranslationDeps: { postTranslationRepo: {}, commentTranslationRepo: {} },
}))

import { onDemandTranslationDeps } from './on-demand-translation-deps'

describe('onDemandTranslationDeps.upsertUnlessReady', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts when absent and only updates rows that are not ready (post)', async () => {
    m.postFindUnique.mockResolvedValue({ status: 'ready', text: 'Hello' })
    const row = await onDemandTranslationDeps.postTranslationRepo.upsertUnlessReady!({
      postId: 'p1', bodyVersion: 2, language: 'en', status: 'pending', text: null,
    })
    expect(m.postCreateMany).toHaveBeenCalledWith({
      data: [{ postId: 'p1', bodyVersion: 2, language: 'en', status: 'pending', text: null }],
      skipDuplicates: true,
    })
    expect(m.postUpdateMany).toHaveBeenCalledWith({
      where: { postId: 'p1', bodyVersion: 2, language: 'en', status: { not: 'ready' } },
      data: { status: 'pending', text: null },
    })
    // Reports the row as it stands: the ready translation survived.
    expect(row).toMatchObject({ status: 'ready', text: 'Hello' })
  })

  it('guards comment rows the same way', async () => {
    m.commentFindUnique.mockResolvedValue({ status: 'failed', text: null })
    const row = await onDemandTranslationDeps.commentTranslationRepo.upsertUnlessReady!({
      commentId: 'c1', bodyVersion: 1, language: 'ko', status: 'failed', text: null,
    })
    expect(m.commentUpdateMany).toHaveBeenCalledWith({
      where: { commentId: 'c1', bodyVersion: 1, language: 'ko', status: { not: 'ready' } },
      data: { status: 'failed', text: null },
    })
    expect(row.status).toBe('failed')
  })
})
