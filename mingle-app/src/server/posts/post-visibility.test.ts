import { describe, expect, it } from 'vitest'
import { visiblePostWhere, visibleSinglePostWhere, ownPostWhere } from './post-visibility'

describe('visiblePostWhere', () => {
  const viewerId = 'viewer-1'

  it('requires public visibility', () => {
    const where = visiblePostWhere(viewerId)
    expect(where.visibility).toBe('public')
  })

  it('excludes soft-deleted posts', () => {
    const where = visiblePostWhere(viewerId)
    expect(where.OR).toEqual([{ isDeleted: null }, { isDeleted: false }])
  })

  it('excludes moderation-hidden posts', () => {
    const where = visiblePostWhere(viewerId)
    expect(where.moderationHiddenAt).toBeNull()
  })

  it('excludes mutually blocked and operator-hidden authors', () => {
    const where = visiblePostWhere(viewerId)
    expect(where.author).toEqual({
      moderationHiddenAt: null,
      AND: [
        { blockedByRelations: { none: { blockerId: viewerId } } },
        { blockingRelations: { none: { blockedId: viewerId } } },
      ],
    })
  })

  it('excludes viewer-hidden posts', () => {
    const where = visiblePostWhere(viewerId)
    expect(where.hides).toEqual({ none: { userId: viewerId } })
  })

  it('keeps every content rule for a signed-out viewer but drops blocks and hides', () => {
    const where = visiblePostWhere(null)
    expect(where.visibility).toBe('public')
    expect(where.moderationHiddenAt).toBeNull()
    expect(where.author).toEqual({ moderationHiddenAt: null })
    expect(where).not.toHaveProperty('hides')
  })
})

describe('visibleSinglePostWhere', () => {
  it('includes the postId alongside visibility conditions', () => {
    const where = visibleSinglePostWhere('post-1', 'viewer-1')
    expect(where.id).toBe('post-1')
    expect(where.visibility).toBe('public')
  })
})

describe('ownPostWhere', () => {
  it('scopes to author and not-deleted', () => {
    const where = ownPostWhere('post-1', 'author-1')
    expect(where.id).toBe('post-1')
    expect(where.authorId).toBe('author-1')
    expect(where.OR).toEqual([{ isDeleted: null }, { isDeleted: false }])
  })

  it('does not apply visibility or block filters', () => {
    const where = ownPostWhere('post-1', 'author-1')
    expect(where).not.toHaveProperty('visibility')
    expect(where).not.toHaveProperty('author')
    expect(where).not.toHaveProperty('hides')
    expect(where).not.toHaveProperty('moderationHiddenAt')
  })
})
