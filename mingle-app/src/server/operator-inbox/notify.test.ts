import { describe, expect, it } from 'vitest'
import { notifyOperatorInboxActivity } from './notify'

describe('notifyOperatorInboxActivity (Phase 0 seam)', () => {
  it('resolves without doing anything for text and photo messages', async () => {
    await expect(notifyOperatorInboxActivity({
      sessionKey: 'sess_1',
      senderUserId: 'user_1',
      memberUserIds: ['user_1', 'op_1'],
      messageId: 'msg_1',
      preview: 'hello',
      kind: 'text',
    })).resolves.toBeUndefined()
    await expect(notifyOperatorInboxActivity({
      sessionKey: 'sess_1',
      conversationId: 'conv_1',
      senderUserId: null,
      memberUserIds: [],
      messageId: 'msg_2',
      preview: null,
      kind: 'photo',
    })).resolves.toBeUndefined()
  })
})
