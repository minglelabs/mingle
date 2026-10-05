/**
 * Fixation test (W3/R task item 6): operator-hidden content and operator-hidden
 * authors must disappear CONSISTENTLY from the feed, a profile grid, search, a
 * direct link (single-item lookup) and the comment thread. The individual
 * visibility helpers each carry the rule; this test pins that they ALL do, so a
 * future edit to one surface cannot silently drop the operator-hidden filter.
 */
import { describe, expect, it } from 'vitest'
import { visiblePostWhere, visibleSinglePostWhere } from './post-visibility'
import { visibleCommentsWhere, visibleSingleCommentWhere } from './comment-visibility'
import { visibleAuthorWhere } from './block-visibility'

const VIEWER = 'viewer-1'

describe('operator hidden is fixed across every post surface', () => {
  it('feed / profile / search list excludes moderation-hidden posts and hidden authors', () => {
    const where = visiblePostWhere(VIEWER)
    expect(where.moderationHiddenAt).toBeNull()
    expect((where.author as { moderationHiddenAt: unknown }).moderationHiddenAt).toBeNull()
  })

  it('direct link (single post) carries the same operator-hidden rule', () => {
    const where = visibleSinglePostWhere('p1', VIEWER)
    expect(where.id).toBe('p1')
    expect(where.moderationHiddenAt).toBeNull()
    expect((where.author as { moderationHiddenAt: unknown }).moderationHiddenAt).toBeNull()
  })

  it('a signed-out direct-link viewer still cannot see operator-hidden content', () => {
    const where = visibleSinglePostWhere('p1', null)
    expect(where.moderationHiddenAt).toBeNull()
    expect(where.author).toEqual({ moderationHiddenAt: null })
  })
})

describe('operator hidden is fixed across every comment surface', () => {
  it('comment list excludes moderation-hidden comments and hidden authors', () => {
    const where = visibleCommentsWhere('p1', VIEWER)
    expect(where.moderationHiddenAt).toBeNull()
    expect((where.author as { moderationHiddenAt: unknown }).moderationHiddenAt).toBeNull()
  })

  it('single comment (direct link / like target) carries the same rule', () => {
    const where = visibleSingleCommentWhere('c1', VIEWER)
    expect(where.id).toBe('c1')
    expect(where.moderationHiddenAt).toBeNull()
    expect((where.author as { moderationHiddenAt: unknown }).moderationHiddenAt).toBeNull()
  })
})

describe('visibleAuthorWhere is the single source of the operator-hidden author rule', () => {
  it('always excludes an operator-hidden author, signed in or out', () => {
    expect(visibleAuthorWhere(VIEWER).moderationHiddenAt).toBeNull()
    expect(visibleAuthorWhere(null)).toEqual({ moderationHiddenAt: null })
  })
})
