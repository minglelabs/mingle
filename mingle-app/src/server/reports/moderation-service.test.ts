import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hidePostByModerator,
  hideUserByModerator,
  isClosingStatus,
  isValidModerationAction,
  isValidReportStatus,
  restrictUserByModerator,
  unhideCommentByModerator,
  unhidePostByModerator,
  unhideUserByModerator,
} from './moderation-service'

type Recorder = { where: unknown; data: unknown }

function makeTx() {
  const post = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  const postComment = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  const user = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { post, postComment, user } as any
}

describe('moderation hide/unhide', () => {
  let tx: ReturnType<typeof makeTx>
  beforeEach(() => {
    tx = makeTx()
  })

  it('hidePost stamps only a not-yet-hidden post (idempotent)', async () => {
    await hidePostByModerator(tx, 'p1')
    const call = tx.post.updateMany.mock.calls[0][0] as Recorder
    expect(call.where).toEqual({ id: 'p1', moderationHiddenAt: null })
    expect(call.data).toMatchObject({ moderationHiddenAt: expect.any(Date) })
  })

  it('unhidePost restores ONLY a public, non-deleted post', async () => {
    await unhidePostByModerator(tx, 'p1')
    const call = tx.post.updateMany.mock.calls[0][0] as Recorder
    expect(call.where).toEqual({
      id: 'p1',
      moderationHiddenAt: { not: null },
      visibility: 'public',
      OR: [{ isDeleted: null }, { isDeleted: false }],
    })
    expect(call.data).toEqual({ moderationHiddenAt: null })
  })

  it('unhideComment restores only a non-deleted comment', async () => {
    await unhideCommentByModerator(tx, 'c1')
    const call = tx.postComment.updateMany.mock.calls[0][0] as Recorder
    expect(call.where).toEqual({
      id: 'c1',
      moderationHiddenAt: { not: null },
      OR: [{ isDeleted: null }, { isDeleted: false }],
    })
  })

  it('hideUser and unhideUser toggle the user stamp', async () => {
    await hideUserByModerator(tx, 'u1')
    expect((tx.user.updateMany.mock.calls[0][0] as Recorder).where).toEqual({ id: 'u1', moderationHiddenAt: null })
    await unhideUserByModerator(tx, 'u1')
    expect((tx.user.updateMany.mock.calls[1][0] as Recorder).where).toEqual({ id: 'u1', moderationHiddenAt: { not: null } })
  })

  it('restrictUser stamps the restriction flag', async () => {
    await restrictUserByModerator(tx, 'u1')
    const call = tx.user.updateMany.mock.calls[0][0] as Recorder
    expect(call.where).toEqual({ id: 'u1', moderationRestrictedAt: null })
    expect(call.data).toMatchObject({ moderationRestrictedAt: expect.any(Date) })
  })
})

describe('validators', () => {
  it('validates report statuses', () => {
    expect(isValidReportStatus('resolved')).toBe(true)
    expect(isValidReportStatus('bogus')).toBe(false)
  })
  it('validates moderation actions', () => {
    expect(isValidModerationAction('hide_content')).toBe(true)
    expect(isValidModerationAction('nuke')).toBe(false)
  })
  it('recognises closing statuses', () => {
    expect(isClosingStatus('resolved')).toBe(true)
    expect(isClosingStatus('rejected')).toBe(true)
    expect(isClosingStatus('open')).toBe(false)
    expect(isClosingStatus('in_review')).toBe(false)
  })
})
