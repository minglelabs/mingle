import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n'

export type LivePhoneDemoConversationInviteCopy = {
  // Rendered in-room when someone is invited (see inviteNotices in the
  // conversation hydration response). Contains literal `{inviterName}` and
  // `{inviteeName}` placeholders — use formatLivePhoneDemoInviteNoticeText
  // below instead of interpolating them directly.
  noticeTemplate: string
}

const INVITE_CONVERSATION_COPY_BY_LOCALE = {
  ko: {
    noticeTemplate: '{inviterName}님이 {inviteeName}님을 초대했습니다.',
  },
  en: {
    noticeTemplate: '{inviterName} invited {inviteeName}.',
  },
  ja: {
    noticeTemplate: '{inviterName}さんが{inviteeName}さんを招待しました。',
  },
  'zh-CN': {
    noticeTemplate: '{inviterName}邀请了{inviteeName}。',
  },
  'zh-TW': {
    noticeTemplate: '{inviterName}邀請了{inviteeName}。',
  },
  fr: {
    noticeTemplate: '{inviterName} a invite {inviteeName}.',
  },
  de: {
    noticeTemplate: '{inviterName} hat {inviteeName} eingeladen.',
  },
  es: {
    noticeTemplate: '{inviterName} invito a {inviteeName}.',
  },
  pt: {
    noticeTemplate: '{inviterName} convidou {inviteeName}.',
  },
  it: {
    noticeTemplate: '{inviterName} ha invitato {inviteeName}.',
  },
  ru: {
    noticeTemplate: '{inviterName} пригласил(а) {inviteeName}.',
  },
  ar: {
    noticeTemplate: 'قام {inviterName} بدعوة {inviteeName}.',
  },
  hi: {
    noticeTemplate: '{inviterName} ने {inviteeName} को आमंत्रित किया।',
  },
  th: {
    noticeTemplate: '{inviterName} ได้เชิญ {inviteeName}',
  },
  vi: {
    noticeTemplate: '{inviterName} da moi {inviteeName}.',
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoConversationInviteCopy>

export function resolveLivePhoneDemoConversationInviteCopy(
  uiLocale: string,
): LivePhoneDemoConversationInviteCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale)

  return INVITE_CONVERSATION_COPY_BY_LOCALE[resolvedLocale] ?? INVITE_CONVERSATION_COPY_BY_LOCALE.en
}

export function formatLivePhoneDemoInviteNoticeText(
  uiLocale: string,
  inviterName: string,
  inviteeName: string,
): string {
  const copy = resolveLivePhoneDemoConversationInviteCopy(uiLocale)
  return copy.noticeTemplate.replace('{inviterName}', inviterName).replace('{inviteeName}', inviteeName)
}
