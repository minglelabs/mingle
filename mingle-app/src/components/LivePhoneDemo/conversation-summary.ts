export type ConversationSummary = {
  overview: string
  keyPoints: string[]
  decisions: string[]
  followUps: string[]
  needsConfirmation: string[]
}

export type ConversationSummaryCopy = {
  finishLabel: string
  finishDialogTitle: string
  finishDialogMessage: string
  continueLabel: string
  finishAndSummarizeLabel: string
  summarizingLabel: string
  summaryTitle: string
  overviewTitle: string
  keyPointsTitle: string
  decisionsTitle: string
  followUpsTitle: string
  needsConfirmationTitle: string
  retryLabel: string
  doneLabel: string
  emptyMessage: string
  errorMessage: string
}

const ENGLISH_COPY: ConversationSummaryCopy = {
  finishLabel: 'Finish',
  finishDialogTitle: 'Finish this conversation?',
  finishDialogMessage: 'Mingle will stop listening and summarize what was discussed.',
  continueLabel: 'Keep talking',
  finishAndSummarizeLabel: 'Finish & summarize',
  summarizingLabel: 'Creating your summary…',
  summaryTitle: 'Conversation summary',
  overviewTitle: 'Overview',
  keyPointsTitle: 'Key points',
  decisionsTitle: 'Decisions',
  followUpsTitle: 'Next steps',
  needsConfirmationTitle: 'Needs confirmation',
  retryLabel: 'Try again',
  doneLabel: 'Done',
  emptyMessage: 'There is not enough conversation to summarize yet.',
  errorMessage: 'We could not create a summary. Your conversation is still saved.',
}

const KOREAN_COPY: ConversationSummaryCopy = {
  finishLabel: '종료',
  finishDialogTitle: '대화를 종료할까요?',
  finishDialogMessage: '음성 인식을 종료하고 지금까지 나눈 대화를 요약해 드려요.',
  continueLabel: '계속 대화하기',
  finishAndSummarizeLabel: '종료하고 요약하기',
  summarizingLabel: '대화를 요약하고 있어요…',
  summaryTitle: '대화 요약',
  overviewTitle: '한눈에 보기',
  keyPointsTitle: '핵심 내용',
  decisionsTitle: '결정된 내용',
  followUpsTitle: '다음 할 일',
  needsConfirmationTitle: '확인이 필요한 내용',
  retryLabel: '다시 시도',
  doneLabel: '완료',
  emptyMessage: '아직 요약할 대화가 충분하지 않아요.',
  errorMessage: '요약을 만들지 못했어요. 대화 내용은 그대로 저장되어 있어요.',
}

export function resolveConversationSummaryCopy(locale: string): ConversationSummaryCopy {
  return locale.trim().toLowerCase().startsWith('ko') ? KOREAN_COPY : ENGLISH_COPY
}

export function hasConversationSummaryContent(summary: ConversationSummary): boolean {
  return Boolean(
    summary.overview.trim()
      || summary.keyPoints.length
      || summary.decisions.length
      || summary.followUps.length
      || summary.needsConfirmation.length,
  )
}
