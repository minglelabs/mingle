import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockPostCreate,
  mockPostFindFirst,
  mockTransaction,
  mockPostTranslationCreateMany,
  mockDetectSourceLanguage,
  mockTranslatePostBodySettled,
  mockResolveDefaultPostTranslationLanguages,
} = vi.hoisted(() => ({
  mockPostCreate: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockTransaction: vi.fn(),
  mockPostTranslationCreateMany: vi.fn(),
  mockDetectSourceLanguage: vi.fn(),
  mockTranslatePostBodySettled: vi.fn(),
  mockResolveDefaultPostTranslationLanguages: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mockTransaction,
    post: { create: mockPostCreate, findFirst: mockPostFindFirst },
    postTranslation: { createMany: mockPostTranslationCreateMany },
  },
}))
vi.mock('@/server/translation/detect-source-language', () => ({
  detectSourceLanguage: mockDetectSourceLanguage,
}))
vi.mock('@/server/translation/post-translation-service', () => ({
  translatePostBodySettled: mockTranslatePostBodySettled,
  resolveDefaultPostTranslationLanguages: mockResolveDefaultPostTranslationLanguages,
}))

import { getBackgroundKeys, isKnownBackgroundKey } from '@/lib/post-backgrounds'
import {
  CLIENT_POST_ID_PATTERN,
  POST_BODY_MAX_LENGTH,
  parseClientPostId,
  publishPost,
} from './publish-post'
import { SEED_CLIENT_POST_ID_PATTERN, SEED_MAX_TEXT_LENGTH } from '../../../scripts/seed-feed-content.logic'

const PUBLISHED_AT = new Date('2026-09-26T00:00:00.000Z')
const CLIENT_ID = 'client-post-0001'

function uniqueViolation(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
}

describe('publishPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPostFindFirst.mockResolvedValue(null)
    mockDetectSourceLanguage.mockResolvedValue('en')
    mockResolveDefaultPostTranslationLanguages.mockReturnValue(['ko', 'ja'])
    mockTranslatePostBodySettled.mockResolvedValue([
      { language: 'ko', status: 'ready', text: '안녕' },
      { language: 'ja', status: 'failed', text: null },
    ])
    mockPostCreate.mockImplementation(async ({ data }: { data: { id?: string; backgroundKey: string } }) => ({
      id: data.id ?? 'server-id',
      backgroundKey: data.backgroundKey,
      publishedAt: PUBLISHED_AT,
    }))
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ post: { create: mockPostCreate }, postTranslation: { createMany: mockPostTranslationCreateMany } }),
    )
  })

  it('publishes a text post atomically with detected language and settled translations', async () => {
    const result = await publishPost({
      authorId: 'user-1',
      text: 'hello',
      imageObjectKey: null,
      clientHint: 'fr',
      clientPostId: CLIENT_ID,
    })

    expect(mockDetectSourceLanguage).toHaveBeenCalledWith({ text: 'hello', clientHint: 'fr' })
    expect(mockTranslatePostBodySettled).toHaveBeenCalledWith({
      sourceText: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko', 'ja'],
    })
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    const data = mockPostCreate.mock.calls[0][0].data
    expect(data).toMatchObject({
      id: CLIENT_ID,
      authorId: 'user-1',
      sourceText: 'hello',
      sourceLanguage: 'en',
      imageObjectKey: null,
      visibility: 'public',
      bodyVersion: 1,
    })
    expect(data).not.toHaveProperty('imageWidth')
    expect(mockPostTranslationCreateMany).toHaveBeenCalledWith({
      data: [
        { postId: CLIENT_ID, bodyVersion: 1, language: 'ko', status: 'ready', text: '안녕' },
        { postId: CLIENT_ID, bodyVersion: 1, language: 'ja', status: 'failed', text: null },
      ],
    })
    expect(result).toEqual({
      kind: 'created',
      post: { id: CLIENT_ID, backgroundKey: data.backgroundKey, publishedAt: PUBLISHED_AT },
      sourceLanguage: 'en',
      translations: [
        { language: 'ko', status: 'ready' },
        { language: 'ja', status: 'failed' },
      ],
    })
  })

  it('publishes an image-only post without detection, translation or a transaction', async () => {
    const result = await publishPost({
      authorId: 'user-1',
      text: '   ',
      imageObjectKey: 'posts/user-1/a.jpg',
      imageDimensions: { imageWidth: 800, imageHeight: 600 },
    })

    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
    expect(mockTranslatePostBodySettled).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockPostCreate.mock.calls[0][0].data).toMatchObject({
      authorId: 'user-1',
      sourceText: null,
      sourceLanguage: null,
      imageObjectKey: 'posts/user-1/a.jpg',
      imageWidth: 800,
      imageHeight: 600,
    })
    expect(mockPostCreate.mock.calls[0][0].data).not.toHaveProperty('id')
    expect(result).toMatchObject({ kind: 'created', sourceLanguage: null, translations: [] })
  })

  it('stores null dimensions for an image without a size hint', async () => {
    await publishPost({ authorId: 'user-1', text: null, imageObjectKey: 'k' })
    expect(mockPostCreate.mock.calls[0][0].data).toMatchObject({ imageWidth: null, imageHeight: null })
  })

  it('skips translation when the language cannot be detected', async () => {
    mockDetectSourceLanguage.mockResolvedValue(null)
    const result = await publishPost({ authorId: 'user-1', text: '???', imageObjectKey: null })
    expect(mockTranslatePostBodySettled).not.toHaveBeenCalled()
    expect(mockPostTranslationCreateMany).not.toHaveBeenCalled()
    expect(result).toMatchObject({ kind: 'created', sourceLanguage: null, translations: [] })
  })

  it('returns the existing post for a repeated clientPostId before any detection or write', async () => {
    const existing = { id: CLIENT_ID, backgroundKey: 'bg', publishedAt: PUBLISHED_AT }
    mockPostFindFirst.mockResolvedValue(existing)
    const result = await publishPost({ authorId: 'user-1', text: 'hello', imageObjectKey: null, clientPostId: CLIENT_ID })

    expect(mockPostFindFirst).toHaveBeenCalledWith({
      where: { authorId: 'user-1', id: CLIENT_ID },
      select: { id: true, backgroundKey: true, publishedAt: true },
    })
    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
    expect(mockPostCreate).not.toHaveBeenCalled()
    expect(result).toEqual({ kind: 'duplicate', post: existing })
  })

  it('answers a lost create race with the winner post', async () => {
    const winner = { id: CLIENT_ID, backgroundKey: 'bg', publishedAt: PUBLISHED_AT }
    mockPostFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(winner)
    mockTransaction.mockRejectedValueOnce(uniqueViolation())
    const result = await publishPost({ authorId: 'user-1', text: 'hello', imageObjectKey: null, clientPostId: CLIENT_ID })
    expect(result).toEqual({ kind: 'duplicate', post: winner })
  })

  it('reports a conflict when the clientPostId belongs to another author', async () => {
    mockTransaction.mockRejectedValueOnce(uniqueViolation())
    const result = await publishPost({ authorId: 'user-1', text: 'hello', imageObjectKey: null, clientPostId: CLIENT_ID })
    expect(result).toEqual({ kind: 'conflict' })
  })

  it('rethrows a write error that is not a unique violation', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('db down'))
    await expect(
      publishPost({ authorId: 'user-1', text: 'hello', imageObjectKey: null, clientPostId: CLIENT_ID }),
    ).rejects.toThrow('db down')
  })

  it('ignores a malformed clientPostId for both the lookup and the create', async () => {
    await publishPost({ authorId: 'user-1', text: 'hello', imageObjectKey: null, clientPostId: 'short' })
    expect(mockPostFindFirst).not.toHaveBeenCalled()
    expect(mockPostCreate.mock.calls[0][0].data).not.toHaveProperty('id')
  })

  it('keeps a catalog background and replaces anything else with a catalog key', async () => {
    const [catalogKey] = getBackgroundKeys()
    await publishPost({ authorId: 'user-1', text: 'a', imageObjectKey: null, backgroundKey: catalogKey })
    expect(mockPostCreate.mock.calls[0][0].data.backgroundKey).toBe(catalogKey)

    for (const bad of ['not-a-key', 42, null, undefined]) {
      mockPostCreate.mockClear()
      await publishPost({ authorId: 'user-1', text: 'a', imageObjectKey: null, backgroundKey: bad })
      expect(isKnownBackgroundKey(mockPostCreate.mock.calls[0][0].data.backgroundKey)).toBe(true)
    }
  })

  it('refuses a call with neither text nor image', async () => {
    await expect(publishPost({ authorId: 'user-1', text: ' ', imageObjectKey: null })).rejects.toThrow(
      'text or image is required',
    )
    expect(mockPostCreate).not.toHaveBeenCalled()
  })

  it('parses clientPostId with the documented pattern', () => {
    expect(parseClientPostId(CLIENT_ID)).toBe(CLIENT_ID)
    expect(parseClientPostId('a'.repeat(11))).toBeNull()
    expect(parseClientPostId('a'.repeat(129))).toBeNull()
    expect(parseClientPostId('has space here!')).toBeNull()
    expect(parseClientPostId(123)).toBeNull()
  })

  it('shares its limits with the seed script content rules', () => {
    expect(SEED_CLIENT_POST_ID_PATTERN.source).toBe(CLIENT_POST_ID_PATTERN.source)
    expect(SEED_MAX_TEXT_LENGTH).toBe(POST_BODY_MAX_LENGTH)
  })
})
