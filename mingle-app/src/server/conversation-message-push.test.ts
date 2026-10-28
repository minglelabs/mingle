import { describe, expect, it } from 'vitest'
import { claimConversationMessagePush } from './conversation-message-push'

describe('claimConversationMessagePush', () => {
  it('lets only the first caller send a message push', () => {
    expect(claimConversationMessagePush('msg_claim_1', 1_000)).toBe(true)
    expect(claimConversationMessagePush('msg_claim_1', 2_000)).toBe(false)
    expect(claimConversationMessagePush('msg_claim_2', 2_000)).toBe(true)
  })

  it('forgets claims after ten minutes', () => {
    expect(claimConversationMessagePush('msg_claim_3', 0)).toBe(true)
    expect(claimConversationMessagePush('msg_claim_3', 10 * 60 * 1000 + 1)).toBe(true)
  })
})
