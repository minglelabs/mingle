export type LivePhoneDemoFeedbackCategory = 'feedback' | 'suggestion' | 'inquiry'

export type LivePhoneDemoFeedbackCopy = {
  sectionLabel: string
  title: string
  description: string
  historyTitle: string
  historyDescription: string
  historyLoadingLabel: string
  historyEmptyLabel: string
  historyErrorMessage: string
  pendingReplyLabel: string
  meLabel: string
  teamLabel: string
  categoryLabel: string
  messageLabel: string
  messagePlaceholder: string
  emailLabel: string
  emailPlaceholder: string
  minimumLengthHint: string
  sendButtonLabel: string
  sendingButtonLabel: string
  successMessage: string
  errorMessage: string
  invalidEmailMessage: string
  messageTooShortMessage: string
  categoryLabels: Record<LivePhoneDemoFeedbackCategory, string>
}

const KO_FEEDBACK_COPY: LivePhoneDemoFeedbackCopy = {
  sectionLabel: 'TEAM',
  title: '운영진에게 보내기',
  description: '불편한 점, 개선 아이디어, 문의사항을 바로 남겨주세요.',
  historyTitle: '내 문의 내역',
  historyDescription: '보낸 내용과 운영진 답변이 시간순으로 쌓입니다.',
  historyLoadingLabel: '문의 내역 불러오는 중...',
  historyEmptyLabel: '아직 보낸 문의가 없습니다.',
  historyErrorMessage: '문의 내역을 불러오지 못했습니다.',
  pendingReplyLabel: '운영진 답변 대기 중',
  meLabel: '나',
  teamLabel: '운영진',
  categoryLabel: '종류',
  messageLabel: '내용',
  messagePlaceholder: '어떤 점이 불편했는지, 어떤 기능이 필요하신지 자세히 적어주세요.',
  emailLabel: '답변받을 이메일',
  emailPlaceholder: '선택사항',
  minimumLengthHint: '최소 10자 이상 입력해 주세요.',
  sendButtonLabel: '보내기',
  sendingButtonLabel: '보내는 중...',
  successMessage: '운영진에게 전달되었습니다. 감사합니다.',
  errorMessage: '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  invalidEmailMessage: '올바른 이메일 주소를 입력해 주세요.',
  messageTooShortMessage: '내용을 조금 더 자세히 적어 주세요.',
  categoryLabels: {
    feedback: '피드백',
    suggestion: '건의사항',
    inquiry: '문의',
  },
}

const EN_FEEDBACK_COPY: LivePhoneDemoFeedbackCopy = {
  sectionLabel: 'TEAM',
  title: 'Contact the team',
  description: 'Send feedback, feature ideas, or support questions from here.',
  historyTitle: 'My feedback history',
  historyDescription: 'Your messages and team replies appear here in order.',
  historyLoadingLabel: 'Loading your history...',
  historyEmptyLabel: 'No messages sent yet.',
  historyErrorMessage: 'Failed to load your feedback history.',
  pendingReplyLabel: 'Waiting for a team reply',
  meLabel: 'You',
  teamLabel: 'Team',
  categoryLabel: 'Type',
  messageLabel: 'Message',
  messagePlaceholder: 'Tell us what happened, what you want improved, or what you need help with.',
  emailLabel: 'Reply email',
  emailPlaceholder: 'Optional',
  minimumLengthHint: 'Please enter at least 10 characters.',
  sendButtonLabel: 'Send',
  sendingButtonLabel: 'Sending...',
  successMessage: 'Your message was sent to the team.',
  errorMessage: 'Failed to send your message. Please try again.',
  invalidEmailMessage: 'Please enter a valid email address.',
  messageTooShortMessage: 'Please add a bit more detail.',
  categoryLabels: {
    feedback: 'Feedback',
    suggestion: 'Suggestion',
    inquiry: 'Inquiry',
  },
}

export function resolveLivePhoneDemoFeedbackCopy(
  uiLocale: string,
): LivePhoneDemoFeedbackCopy {
  const normalizedLocale = uiLocale.trim().toLowerCase()

  if (normalizedLocale === 'ko' || normalizedLocale.startsWith('ko-')) {
    return KO_FEEDBACK_COPY
  }

  return EN_FEEDBACK_COPY
}
