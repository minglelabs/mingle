import { describe, expect, it } from 'vitest'
import type { CommentThreadDto } from './comment-types'
import {
  applyDelete,
  applyEdit,
  applyLikeToggle,
  canDelete,
  canEdit,
  canReport,
  confirmNode,
  findNode,
  insertOptimistic,
  makeOptimisticNode,
  markFailed,
  removeNode,
  rootIdOf,
  setTranslation,
  toNodes,
} from './comment-state'

function dto(over: Partial<CommentThreadDto> & { id: string }): CommentThreadDto {
  return {
    postId: 'p1',
    authorId: 'a1',
    parentId: null,
    replyToUserId: null,
    bodyVersion: 1,
    sourceText: 'hi',
    sourceLanguage: 'en',
    displayText: 'hi',
    displayLanguage: 'en',
    translationState: 'same_language',
    likeCount: 0,
    isDeleted: false,
    edited: false,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    author: { id: 'a1', handle: 'h1', name: 'A', image: null },
    replyToUser: null,
    replyCount: 0,
    liked: false,
    replies: [],
    ...over,
  }
}

const AUTHOR = { id: 'me', handle: 'me', name: 'Me', image: null }

describe('toNodes / findNode / rootIdOf', () => {
  it('finds a reply and resolves its root', () => {
    const nodes = toNodes([
      dto({ id: 'c1', replies: [{ ...dto({ id: 'r1', parentId: 'c1' }) }] }),
    ])
    expect(findNode(nodes, 'r1')?.id).toBe('r1')
    expect(rootIdOf(nodes, 'r1')).toBe('c1')
    expect(rootIdOf(nodes, 'c1')).toBe('c1')
    expect(rootIdOf(nodes, 'nope')).toBeNull()
  })
})

describe('applyLikeToggle', () => {
  it('likes and unlikes without reordering', () => {
    const nodes = toNodes([dto({ id: 'c1', likeCount: 2, liked: false })])
    const liked = applyLikeToggle(nodes, 'c1', true)
    expect(liked[0].likeCount).toBe(3)
    expect(liked[0].liked).toBe(true)
    const back = applyLikeToggle(liked, 'c1', false)
    expect(back[0].likeCount).toBe(2)
    expect(back[0].liked).toBe(false)
  })

  it('never drops below zero on unlike', () => {
    const nodes = toNodes([dto({ id: 'c1', likeCount: 0, liked: true })])
    expect(applyLikeToggle(nodes, 'c1', false)[0].likeCount).toBe(0)
  })

  it('likes a nested reply', () => {
    const nodes = toNodes([dto({ id: 'c1', replies: [{ ...dto({ id: 'r1', parentId: 'c1', likeCount: 1 }) }] })])
    const out = applyLikeToggle(nodes, 'r1', true)
    expect(out[0].replies![0].likeCount).toBe(2)
  })
})

describe('optimistic create → confirm / fail / rollback', () => {
  it('inserts a top-level optimistic node oldest-last', () => {
    const nodes = toNodes([dto({ id: 'c1' })])
    const opt = makeOptimisticNode({
      tempId: 'tmp1', postId: 'p1', authorId: 'me', author: AUTHOR,
      sourceText: 'new', sourceLanguage: 'en', parentId: null, replyToUserId: null, replyToUser: null,
    })
    const out = insertOptimistic(nodes, opt)
    expect(out.map((n) => n.id)).toEqual(['c1', 'tmp1'])
    expect(out[1].pending).toBe(true)
  })

  it('inserts a reply under its parent and bumps replyCount', () => {
    const nodes = toNodes([dto({ id: 'c1', replyCount: 0 })])
    const opt = makeOptimisticNode({
      tempId: 'tmpR', postId: 'p1', authorId: 'me', author: AUTHOR,
      sourceText: 'r', sourceLanguage: 'en', parentId: 'c1', replyToUserId: 'a1',
      replyToUser: { id: 'a1', handle: 'h1', name: 'A' },
    })
    const out = insertOptimistic(nodes, opt)
    expect(out[0].replies!.map((r) => r.id)).toEqual(['tmpR'])
    expect(out[0].replyCount).toBe(1)
  })

  it('confirms a temp node with the server id, clearing pending', () => {
    let nodes = toNodes([dto({ id: 'c1' })])
    const opt = makeOptimisticNode({
      tempId: 'tmp1', postId: 'p1', authorId: 'me', author: AUTHOR,
      sourceText: 'new', sourceLanguage: 'en', parentId: null, replyToUserId: null, replyToUser: null,
    })
    nodes = insertOptimistic(nodes, opt)
    nodes = confirmNode(nodes, 'tmp1', { id: 'real1', bodyVersion: 1 })
    const real = findNode(nodes, 'real1')
    expect(real?.pending).toBe(false)
    expect(findNode(nodes, 'tmp1')).toBeNull()
  })

  it('marks a failed send but keeps the row and its text', () => {
    let nodes = toNodes([])
    const opt = makeOptimisticNode({
      tempId: 'tmp1', postId: 'p1', authorId: 'me', author: AUTHOR,
      sourceText: 'keep me', sourceLanguage: 'en', parentId: null, replyToUserId: null, replyToUser: null,
    })
    nodes = insertOptimistic(nodes, opt)
    nodes = markFailed(nodes, 'tmp1')
    const failed = findNode(nodes, 'tmp1')
    expect(failed?.failed).toBe(true)
    expect(failed?.pending).toBe(false)
    expect(failed?.sourceText).toBe('keep me')
  })

  it('removes a discarded failed node and decrements parent replyCount', () => {
    let nodes = toNodes([dto({ id: 'c1', replyCount: 0 })])
    const opt = makeOptimisticNode({
      tempId: 'tmpR', postId: 'p1', authorId: 'me', author: AUTHOR,
      sourceText: 'r', sourceLanguage: 'en', parentId: 'c1', replyToUserId: null, replyToUser: null,
    })
    nodes = insertOptimistic(nodes, opt)
    expect(nodes[0].replyCount).toBe(1)
    nodes = removeNode(nodes, 'tmpR')
    expect(nodes[0].replies).toEqual([])
    expect(nodes[0].replyCount).toBe(0)
  })
})

describe('applyDelete', () => {
  it('redacts a top-level comment that has live replies', () => {
    const nodes = toNodes([dto({ id: 'c1', replies: [{ ...dto({ id: 'r1', parentId: 'c1' }) }], replyCount: 1 })])
    const out = applyDelete(nodes, 'c1', true)
    expect(out[0].isDeleted).toBe(true)
    expect(out[0].sourceText).toBeNull()
    expect(out[0].displayText).toBeNull()
    expect(out[0].replies).toHaveLength(1)
  })

  it('removes a top-level comment with no live replies', () => {
    const nodes = toNodes([dto({ id: 'c1' }), dto({ id: 'c2' })])
    expect(applyDelete(nodes, 'c1', false).map((n) => n.id)).toEqual(['c2'])
  })

  it('removes a reply and its now-empty deleted parent', () => {
    const nodes = toNodes([
      dto({ id: 'c1', isDeleted: true, sourceText: null, replyCount: 1, replies: [{ ...dto({ id: 'r1', parentId: 'c1' }) }] }),
    ])
    const out = applyDelete(nodes, 'r1', false)
    expect(out).toEqual([]) // parent was only alive because of r1
  })

  it('keeps a live parent when one of several replies is deleted', () => {
    const nodes = toNodes([
      dto({ id: 'c1', replyCount: 2, replies: [{ ...dto({ id: 'r1', parentId: 'c1' }) }, { ...dto({ id: 'r2', parentId: 'c1' }) }] }),
    ])
    const out = applyDelete(nodes, 'r1', false)
    expect(out[0].replies!.map((r) => r.id)).toEqual(['r2'])
    expect(out[0].replyCount).toBe(1)
  })
})

describe('applyEdit', () => {
  it('updates body, bumps version, resets translation overlay', () => {
    const nodes = toNodes([dto({ id: 'c1', sourceText: 'old', bodyVersion: 1, translationState: 'ready' })])
    const out = applyEdit(nodes, 'c1', 'new text', 'en')
    expect(out[0].sourceText).toBe('new text')
    expect(out[0].displayText).toBe('new text')
    expect(out[0].bodyVersion).toBe(2)
    expect(out[0].edited).toBe(true)
    expect(out[0].translationState).toBe('none')
    expect(out[0].translation).toBeUndefined()
  })
})

describe('setTranslation', () => {
  it('attaches a translation overlay', () => {
    const nodes = toNodes([dto({ id: 'c1' })])
    const out = setTranslation(nodes, 'c1', { state: 'ready', text: '번역', showing: true })
    expect(out[0].translation).toEqual({ state: 'ready', text: '번역', showing: true })
  })
})

describe('permissions', () => {
  const mine = dto({ id: 'c1', authorId: 'me' })
  const others = dto({ id: 'c2', authorId: 'other' })
  const deleted = dto({ id: 'c3', authorId: 'me', isDeleted: true })

  it('canEdit only own live comment', () => {
    expect(canEdit(mine, 'me')).toBe(true)
    expect(canEdit(others, 'me')).toBe(false)
    expect(canEdit(deleted, 'me')).toBe(false)
    expect(canEdit(mine, null)).toBe(false)
  })

  it('canDelete own comment or when post author', () => {
    expect(canDelete(mine, 'me', 'someone')).toBe(true)
    expect(canDelete(others, 'me', 'me')).toBe(true) // I own the post
    expect(canDelete(others, 'me', 'other')).toBe(false)
    expect(canDelete(others, null, 'me')).toBe(false)
  })

  it('canReport only others live comment when signed in', () => {
    expect(canReport(others, 'me')).toBe(true)
    expect(canReport(mine, 'me')).toBe(false)
    expect(canReport(others, null)).toBe(false)
  })
})
