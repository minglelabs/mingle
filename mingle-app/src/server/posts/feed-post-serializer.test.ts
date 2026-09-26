import { describe, expect, it } from 'vitest'
import {
  deriveTranslation,
  resolveDisplayLanguage,
  serializeFeedPost,
  serializeFeedPosts,
  serializePostImage,
  type SerializerContext,
  type SerializerPostRow,
  type SerializerTranslationRow,
} from './feed-post-serializer'

function makePost(overrides: Partial<SerializerPostRow> = {}): SerializerPostRow {
  return {
    id: 'p1',
    authorId: 'author-1',
    bodyVersion: 2,
    sourceText: 'Hello world',
    sourceLanguage: 'en',
    backgroundKey: 'warm-cream',
    imageObjectKey: null,
    visibility: 'public',
    deletedAt: null,
    likeCount: 3,
    commentCount: 1,
    publishedAt: new Date('2026-01-02T03:04:05.000Z'),
    author: { id: 'author-1', handle: 'alice', name: 'Alice', image: 'https://cdn/a.png' },
    ...overrides,
  }
}

function makeCtx(overrides: Partial<SerializerContext> = {}): SerializerContext {
  return {
    viewerId: 'viewer-1',
    displayLanguage: null,
    likedPostIds: new Set(),
    followedAuthorIds: new Set(),
    translationByPostId: new Map(),
    includeDeletedAt: false,
    ...overrides,
  }
}

describe('resolveDisplayLanguage', () => {
  it("prefers the viewer's saved default display language over the request", () => {
    expect(resolveDisplayLanguage('ko-KR', 'ja')).toBe('ja')
  })
  it('uses the request when the viewer has no saved default (e.g. signed out)', () => {
    expect(resolveDisplayLanguage('ko-KR', null)).toBe('ko')
  })
  it('falls back to the request when the saved default does not canonicalize', () => {
    expect(resolveDisplayLanguage('fr', 'zzz')).toBe('fr')
  })
  it('returns null when neither yields a supported code', () => {
    expect(resolveDisplayLanguage(null, null)).toBeNull()
    expect(resolveDisplayLanguage('', 'zzz')).toBeNull()
  })
  it('canonicalizes zh variants', () => {
    expect(resolveDisplayLanguage('zh-Hans', null)).toBe('zh-CN')
  })
})

describe('serializePostImage', () => {
  it('returns null when there is no image', () => {
    expect(serializePostImage('p1', null)).toBeNull()
  })
  it('builds the app image route path with null dimensions', () => {
    const img = serializePostImage('p 1', 'post-images/x.jpg')
    expect(img).not.toBeNull()
    expect(img!.url).toBe('/api/posts/p%201/image')
    expect(img!.width).toBeNull()
    expect(img!.height).toBeNull()
  })
  it('passes stored pixel dimensions through', () => {
    const img = serializePostImage('p1', 'post-images/x.jpg', 1536, 2048)
    expect(img).toEqual({ url: '/api/posts/p1/image', width: 1536, height: 2048 })
  })
  it('drops a partial or invalid dimension pair', () => {
    expect(serializePostImage('p1', 'k', 100, null)).toMatchObject({ width: null, height: null })
    expect(serializePostImage('p1', 'k', 0, 10)).toMatchObject({ width: null, height: null })
    expect(serializePostImage('p1', 'k', 1.5, 10)).toMatchObject({ width: null, height: null })
  })
})

describe('deriveTranslation', () => {
  it('none + null language when no display language', () => {
    expect(deriveTranslation({ sourceLanguage: 'en' }, null, undefined)).toEqual({
      translationState: 'none',
      displayText: null,
      displayLanguage: null,
    })
  })
  it('same_language when source equals display', () => {
    expect(deriveTranslation({ sourceLanguage: 'EN' }, 'en', undefined)).toEqual({
      translationState: 'same_language',
      displayText: null,
      displayLanguage: 'en',
    })
  })
  it('ready surfaces the translation text', () => {
    const t: SerializerTranslationRow = { postId: 'p1', bodyVersion: 2, language: 'ko', status: 'ready', text: '안녕' }
    expect(deriveTranslation({ sourceLanguage: 'en' }, 'ko', t)).toEqual({
      translationState: 'ready',
      displayText: '안녕',
      displayLanguage: 'ko',
    })
  })
  it('pending / failed / none for the other statuses', () => {
    expect(
      deriveTranslation({ sourceLanguage: 'en' }, 'ko', { postId: 'p1', bodyVersion: 2, language: 'ko', status: 'pending', text: null }).translationState,
    ).toBe('pending')
    expect(
      deriveTranslation({ sourceLanguage: 'en' }, 'ko', { postId: 'p1', bodyVersion: 2, language: 'ko', status: 'failed', text: null }).translationState,
    ).toBe('failed')
    expect(deriveTranslation({ sourceLanguage: 'en' }, 'ko', undefined).translationState).toBe('none')
  })
})

describe('serializeFeedPost', () => {
  it('maps the frozen DTO shape and passes author image through as imageUrl', () => {
    const dto = serializeFeedPost(makePost(), makeCtx())
    expect(dto.author).toEqual({ id: 'author-1', handle: 'alice', name: 'Alice', imageUrl: 'https://cdn/a.png' })
    expect(dto.sourceText).toBe('Hello world')
    expect(dto.backgroundKey).toBe('warm-cream')
    expect(dto.publishedAt).toBe('2026-01-02T03:04:05.000Z')
    expect(dto.visibility).toBe('public')
    expect(dto.deletedAt).toBeNull()
  })

  it('sets author.isOfficial only for official accounts and omits it otherwise', () => {
    const official = serializeFeedPost(
      makePost({ author: { id: 'author-1', handle: 'mingle_team', name: 'Mingle', image: null, isOfficial: true } }),
      makeCtx(),
    )
    expect(official.author.isOfficial).toBe(true)
    const member = serializeFeedPost(
      makePost({ author: { id: 'author-1', handle: 'alice', name: 'Alice', image: null, isOfficial: false } }),
      makeCtx(),
    )
    expect(member.author).not.toHaveProperty('isOfficial')
    // A select that predates the column reads as not official.
    expect(serializeFeedPost(makePost(), makeCtx()).author).not.toHaveProperty('isOfficial')
  })

  it('does not change counts or order for an official author', () => {
    const rows = [
      makePost({ id: 'a', likeCount: 1, author: { id: 'o', handle: 'mingle_team', name: null, image: null, isOfficial: true } }),
      makePost({ id: 'b', likeCount: 5 }),
    ]
    const dtos = serializeFeedPosts(rows, makeCtx())
    expect(dtos.map((d) => [d.id, d.likeCount, d.commentCount])).toEqual([['a', 1, 1], ['b', 5, 1]])
  })

  it('likedByMe and followingAuthor reflect the batched sets', () => {
    const dto = serializeFeedPost(
      makePost(),
      makeCtx({ likedPostIds: new Set(['p1']), followedAuthorIds: new Set(['author-1']) }),
    )
    expect(dto.likedByMe).toBe(true)
    expect(dto.followingAuthor).toBe(true)
  })

  it('followingAuthor is null for own post and for signed-out viewer', () => {
    const own = serializeFeedPost(makePost({ authorId: 'viewer-1' }), makeCtx())
    expect(own.isMine).toBe(true)
    expect(own.followingAuthor).toBeNull()

    const anon = serializeFeedPost(makePost(), makeCtx({ viewerId: null }))
    expect(anon.followingAuthor).toBeNull()
    expect(anon.likedByMe).toBe(false)
    expect(anon.isMine).toBe(false)
  })

  it('surfaces deletedAt only when includeDeletedAt is set', () => {
    const deletedAt = new Date('2026-02-01T00:00:00.000Z')
    const hidden = serializeFeedPost(makePost({ deletedAt }), makeCtx())
    expect(hidden.deletedAt).toBeNull()
    const trash = serializeFeedPost(makePost({ deletedAt }), makeCtx({ includeDeletedAt: true }))
    expect(trash.deletedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('normalizes archived visibility and leaves anything else public', () => {
    expect(serializeFeedPost(makePost({ visibility: 'archived' }), makeCtx()).visibility).toBe('archived')
    expect(serializeFeedPost(makePost({ visibility: 'weird' }), makeCtx()).visibility).toBe('public')
  })

  it('serializeFeedPosts preserves order', () => {
    const posts = [makePost({ id: 'a' }), makePost({ id: 'b' }), makePost({ id: 'c' })]
    expect(serializeFeedPosts(posts, makeCtx()).map((d) => d.id)).toEqual(['a', 'b', 'c'])
  })
})
