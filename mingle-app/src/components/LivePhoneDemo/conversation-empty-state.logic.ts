export interface ConversationEmptyStateVisibilityInput {
  utteranceCount: number
  liveUtteranceCount: number
  hasPartialTranscript: boolean
  hasDemoTypingText: boolean
  hasDemoTypingLanguage: boolean
  isDemoAnimating: boolean
  isError: boolean
  isLimitReached: boolean
  hasComposerDraft: boolean
}

export function shouldShowConversationEmptyState(
  input: ConversationEmptyStateVisibilityInput,
): boolean {
  return input.utteranceCount === 0
    && input.liveUtteranceCount === 0
    && !input.hasPartialTranscript
    && !input.hasDemoTypingText
    && !input.hasDemoTypingLanguage
    && !input.isDemoAnimating
    && !input.isError
    && !input.isLimitReached
    && !input.hasComposerDraft
}
