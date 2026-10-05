import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUserFindUnique, mockTargets, mockCommentFindUnique, mockPublish, mockSendPush } = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockTargets: vi.fn(),
  mockCommentFindUnique: vi.fn(),
  mockPublish: vi.fn(),
  mockSendPush: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    adminNotifyTarget: { findMany: mockTargets },
    postComment: { findUnique: mockCommentFindUnique },
  },
}))
vi.mock('@/server/conversation-realtime', () => ({ publishAdminInboxEvent: mockPublish }))
vi.mock('@/server/push-notifications', () => ({ sendPushToUsers: mockSendPush }))

import { decodeOperatorInboxActorLabel, resolveOperatorInboxPushCopy } from '@/server/operator-inbox/push-copy'
import { notifyOperatorActivity } from './notify'

function users(recipient: Record<string, unknown> | null, actor: Record<string, unknown> | null) {
  mockUserFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id.startsWith('op') ? recipient : actor))
}

describe('notifyOperatorActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    users({ name: 'Mina', handle: 'mina', isOperator: true, isDeleted: false }, { name: 'João', handle: 'joao', isOfficial: false, isOperator: false })
    mockTargets.mockResolvedValue([{ userId: 'staff_1' }])
    mockCommentFindUnique.mockResolvedValue({ sourceText: 'Que legal!', imageObjectKey: null })
    mockPublish.mockResolvedValue(undefined)
    mockSendPush.mockResolvedValue(undefined)
  })

  it('does nothing for an ordinary recipient', async () => {
    users({ name: 'Ana', handle: 'ana', isOperator: false, isDeleted: false }, { name: 'João', handle: 'joao', isOperator: false })
    await notifyOperatorActivity({ type: 'comment', recipientId: 'op_x', actorId: 'user_1', postId: 'p1', commentId: 'c1' })
    expect(mockPublish).not.toHaveBeenCalled()
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  it('ignores activity from another operator account', async () => {
    users({ name: 'Mina', handle: 'mina', isOperator: true, isDeleted: false }, { name: 'Luca', handle: 'luca', isOperator: true })
    await notifyOperatorActivity({ type: 'comment', recipientId: 'op_1', actorId: 'user_op', postId: 'p1', commentId: 'c1' })
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('refreshes the admin list without a push for a like or follow', async () => {
    await notifyOperatorActivity({ type: 'post_like', recipientId: 'op_1', actorId: 'user_1', postId: 'p_like' })
    await notifyOperatorActivity({ type: 'follow', recipientId: 'op_1', actorId: 'user_1' })
    expect(mockPublish).toHaveBeenCalledTimes(2)
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  it('alerts staff about a comment once per post in the coalescing window', async () => {
    await notifyOperatorActivity({ type: 'comment', recipientId: 'op_1', actorId: 'user_1', postId: 'p_push', commentId: 'c1' })
    await notifyOperatorActivity({ type: 'comment_reply', recipientId: 'op_1', actorId: 'user_1', postId: 'p_push', commentId: 'c2' })
    expect(mockSendPush).toHaveBeenCalledTimes(1)
    const [userIds, build] = mockSendPush.mock.calls[0]
    expect(userIds).toEqual(['staff_1'])
    const message = build({ userId: 'staff_1', language: 'ko' })
    expect(message).toMatchObject({
      type: 'operator_inbox_message',
      notificationId: 'operator-activity:c1',
      messagePreview: 'Que legal!',
      navigationUrl: '/admin/activity/posts/p_push?as=op_1&comment=c1',
    })
    expect(decodeOperatorInboxActorLabel(message.actorLabel)).toEqual({ operatorNames: ['Mina'], senderLabel: 'João', kind: 'comment' })
    expect(resolveOperatorInboxPushCopy({ recipientLanguage: 'ko', actorLabel: message.actorLabel, messagePreview: message.messagePreview }))
      .toEqual({ title: 'Mina에게 새 댓글', body: 'João: Que legal!' })
  })

  it('never throws', async () => {
    mockUserFindUnique.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notifyOperatorActivity({ type: 'comment', recipientId: 'op_1', actorId: 'user_1' })).resolves.toBeUndefined()
    spy.mockRestore()
  })
})
