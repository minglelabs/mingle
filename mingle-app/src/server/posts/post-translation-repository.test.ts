import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockPostTranslationUpsert,
  mockPostTranslationFindMany,
  mockPostTranslationFindUnique,
  mockCommentTranslationUpsert,
  mockCommentTranslationFindUnique,
  mockCommentTranslationFindMany,
} = vi.hoisted(() => ({
  mockPostTranslationUpsert: vi.fn(),
  mockPostTranslationFindMany: vi.fn(),
  mockPostTranslationFindUnique: vi.fn(),
  mockCommentTranslationUpsert: vi.fn(),
  mockCommentTranslationFindUnique: vi.fn(),
  mockCommentTranslationFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    postTranslation: {
      upsert: mockPostTranslationUpsert,
      findMany: mockPostTranslationFindMany,
      findUnique: mockPostTranslationFindUnique,
    },
    postCommentTranslation: {
      upsert: mockCommentTranslationUpsert,
      findUnique: mockCommentTranslationFindUnique,
      findMany: mockCommentTranslationFindMany,
    },
  },
}))

import {
  prismaPostTranslationRepo,
  prismaCommentTranslationRepo,
} from './post-translation-repository'

describe('prismaPostTranslationRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upsert calls prisma with correct compound key', async () => {
    mockPostTranslationUpsert.mockResolvedValue({
      postId: 'p1', bodyVersion: 1, language: 'ko', status: 'ready', text: '안녕',
    })

    const result = await prismaPostTranslationRepo.upsert({
      postId: 'p1', bodyVersion: 1, language: 'ko', status: 'ready', text: '안녕',
    })

    expect(result.postId).toBe('p1')
    expect(result.status).toBe('ready')
    expect(mockPostTranslationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId_bodyVersion_language: { postId: 'p1', bodyVersion: 1, language: 'ko' } },
      }),
    )
  })

  it('findByPost returns all translations for a post', async () => {
    mockPostTranslationFindMany.mockResolvedValue([
      { postId: 'p1', bodyVersion: 1, language: 'ko', status: 'ready', text: '안녕' },
    ])

    const rows = await prismaPostTranslationRepo.findByPost('p1')
    expect(rows).toHaveLength(1)
    expect(rows[0].language).toBe('ko')
  })

  it('find returns null when not found', async () => {
    mockPostTranslationFindUnique.mockResolvedValue(null)
    const result = await prismaPostTranslationRepo.find('p1', 1, 'fr')
    expect(result).toBeNull()
  })
})

describe('prismaCommentTranslationRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upsert calls prisma with correct compound key', async () => {
    mockCommentTranslationUpsert.mockResolvedValue({
      commentId: 'c1', bodyVersion: 1, language: 'en', status: 'ready', text: 'hello',
    })

    const result = await prismaCommentTranslationRepo.upsert({
      commentId: 'c1', bodyVersion: 1, language: 'en', status: 'ready', text: 'hello',
    })

    expect(result.commentId).toBe('c1')
    expect(mockCommentTranslationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { commentId_bodyVersion_language: { commentId: 'c1', bodyVersion: 1, language: 'en' } },
      }),
    )
  })
})
