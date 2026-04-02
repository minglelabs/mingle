export type LivePhoneDemoFeedbackCategory = 'feedback' | 'suggestion' | 'inquiry'

export type LivePhoneDemoFeedbackCopy = {
  sectionLabel: string
  title: string
  description: string
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
