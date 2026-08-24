import { describe, expect, it } from 'vitest'
import { shouldShowConversationEmptyState } from './conversation-empty-state.logic'

const EMPTY_STATE_INPUT = {
  utteranceCount: 0,
  liveUtteranceCount: 0,
  hasPartialTranscript: false,
  hasDemoTypingText: false,
  hasDemoTypingLanguage: false,
  isDemoAnimating: false,
  isError: false,
  isLimitReached: false,
  hasComposerDraft: false,
}

describe('conversation empty state visibility', () => {
  it('stays visible after Start while the room still has no content', () => {
    expect(shouldShowConversationEmptyState(EMPTY_STATE_INPUT)).toBe(true)
  })

  it('hides when a live or persisted message begins', () => {
    expect(shouldShowConversationEmptyState({
      ...EMPTY_STATE_INPUT,
      liveUtteranceCount: 1,
    })).toBe(false)
    expect(shouldShowConversationEmptyState({
      ...EMPTY_STATE_INPUT,
      utteranceCount: 1,
    })).toBe(false)
    expect(shouldShowConversationEmptyState({
      ...EMPTY_STATE_INPUT,
      hasPartialTranscript: true,
    })).toBe(false)
  })

  it('hides for an error, usage limit, or composer draft', () => {
    expect(shouldShowConversationEmptyState({ ...EMPTY_STATE_INPUT, isError: true })).toBe(false)
    expect(shouldShowConversationEmptyState({ ...EMPTY_STATE_INPUT, isLimitReached: true })).toBe(false)
    expect(shouldShowConversationEmptyState({ ...EMPTY_STATE_INPUT, hasComposerDraft: true })).toBe(false)
  })
})
