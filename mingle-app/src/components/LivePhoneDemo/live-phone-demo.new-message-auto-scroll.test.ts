import { describe, expect, it } from 'vitest'
import {
  AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
  shouldAnchorConversationEntry,
  resolveFirstUnreadUtteranceId,
  deriveNewMessageAutoScrollState,
  resolveNewMessageAutoScrollTargetTop,
  type ChatScrollMessageCountSnapshot,
} from './live-phone-demo.scroll.logic'

function resolveNewMessageAutoScroll(input: {
  previousCounts: ChatScrollMessageCountSnapshot
  nextCounts: ChatScrollMessageCountSnapshot
  previousDistanceToBottom: number
  currentScrollTop: number
  currentScrollHeight: number
  currentClientHeight: number
}): {
  hasNewMessage: boolean
  shouldAutoScroll: boolean
  targetTop: number | null
} {
  const state = deriveNewMessageAutoScrollState({
    previousCounts: input.previousCounts,
    nextCounts: input.nextCounts,
    previousDistanceToBottom: input.previousDistanceToBottom,
    isPaginating: false,
    isLoadingOlder: false,
    nearBottomThresholdPx: AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
  })

  return {
    ...state,
    targetTop: resolveNewMessageAutoScrollTargetTop({
      shouldAutoScroll: state.shouldAutoScroll,
      currentScrollTop: input.currentScrollTop,
      currentScrollHeight: input.currentScrollHeight,
      currentClientHeight: input.currentClientHeight,
    }),
  }
}

describe('new-message near-bottom auto-scroll', () => {
  it('anchors cached entry without waiting for the server and never repeats for new messages', () => {
    const entry = { isVisible: true, isStorageHydrated: true, hasAnchored: false, messageCount: 20, isServerPending: true }
    expect(shouldAnchorConversationEntry(entry)).toBe(true)
    expect(shouldAnchorConversationEntry({ ...entry, hasAnchored: true, messageCount: 21 })).toBe(false)
    expect(shouldAnchorConversationEntry({ ...entry, hasAnchored: true, isServerPending: false })).toBe(false)
    expect(shouldAnchorConversationEntry({ ...entry, isVisible: false })).toBe(false)
    expect(shouldAnchorConversationEntry({ ...entry, messageCount: 0 })).toBe(false)
    expect(shouldAnchorConversationEntry({ ...entry, messageCount: 0, isServerPending: false })).toBe(true)
  })
  it('waits for the server transcript before anchoring an unread entry', () => {
    const entry = { isVisible: true, isStorageHydrated: true, hasAnchored: false, messageCount: 20, isServerPending: true, hasUnread: true }
    expect(shouldAnchorConversationEntry(entry)).toBe(false)
    expect(shouldAnchorConversationEntry({ ...entry, isServerPending: false })).toBe(true)
  })
  it('resolves the first unread utterance by counting only other members from the newest', () => {
    const utterances = [
      { id: 'a', speakerUserId: 'other' },
      { id: 'b', speakerUserId: 'other' },
      { id: 'c', speakerUserId: 'me' },
      { id: 'd', speakerUserId: null },
      { id: 'e', speakerUserId: 'other2' },
    ]
    expect(resolveFirstUnreadUtteranceId({ utterances, unreadCount: 1, viewerUserId: 'me' })).toBe('e')
    expect(resolveFirstUnreadUtteranceId({ utterances, unreadCount: 2, viewerUserId: 'me' })).toBe('b')
    expect(resolveFirstUnreadUtteranceId({ utterances, unreadCount: 10, viewerUserId: 'me' })).toBe('a')
    expect(resolveFirstUnreadUtteranceId({ utterances, unreadCount: 0, viewerUserId: 'me' })).toBeNull()
    expect(resolveFirstUnreadUtteranceId({ utterances, unreadCount: 1, viewerUserId: null })).toBeNull()
  })
  it('scrolls to the appended bottom when a committed chat item arrives while the user is at bottom', () => {
    const previousClientHeight = 620
    const previousScrollHeight = 3_200
    const previousScrollTop = previousScrollHeight - previousClientHeight
    const nextScrollHeight = previousScrollHeight + 84

    expect(resolveNewMessageAutoScroll({
      previousCounts: { utteranceCount: 120, liveUtteranceCount: 0 },
      nextCounts: { utteranceCount: 121, liveUtteranceCount: 0 },
      previousDistanceToBottom: 0,
      currentScrollTop: previousScrollTop,
      currentScrollHeight: nextScrollHeight,
      currentClientHeight: previousClientHeight,
    })).toEqual({
      hasNewMessage: true,
      shouldAutoScroll: true,
      targetTop: nextScrollHeight,
    })
  })

  it('scrolls to the appended bottom when committed chat items arrive within the near-bottom threshold', () => {
    const clientHeight = 620
    const previousScrollHeight = 3_200
    const previousDistanceToBottom = AUTO_SCROLL_BOTTOM_THRESHOLD_PX
    const previousScrollTop = previousScrollHeight - clientHeight - previousDistanceToBottom
    const nextScrollHeight = previousScrollHeight + 168

    expect(resolveNewMessageAutoScroll({
      previousCounts: { utteranceCount: 120, liveUtteranceCount: 0 },
      nextCounts: { utteranceCount: 122, liveUtteranceCount: 0 },
      previousDistanceToBottom,
      currentScrollTop: previousScrollTop,
      currentScrollHeight: nextScrollHeight,
      currentClientHeight: clientHeight,
    })).toEqual({
      hasNewMessage: true,
      shouldAutoScroll: true,
      targetTop: nextScrollHeight,
    })
  })

  it('scrolls to the appended bottom when a live chat item arrives while the user is near bottom', () => {
    const clientHeight = 620
    const previousScrollHeight = 3_200
    const previousDistanceToBottom = AUTO_SCROLL_BOTTOM_THRESHOLD_PX - 1
    const previousScrollTop = previousScrollHeight - clientHeight - previousDistanceToBottom
    const nextScrollHeight = previousScrollHeight + 72

    expect(resolveNewMessageAutoScroll({
      previousCounts: { utteranceCount: 120, liveUtteranceCount: 1 },
      nextCounts: { utteranceCount: 120, liveUtteranceCount: 2 },
      previousDistanceToBottom,
      currentScrollTop: previousScrollTop,
      currentScrollHeight: nextScrollHeight,
      currentClientHeight: clientHeight,
    })).toEqual({
      hasNewMessage: true,
      shouldAutoScroll: true,
      targetTop: nextScrollHeight,
    })
  })
})
