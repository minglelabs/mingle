import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { describe, expect, it } from 'vitest'
import { formatLivePhoneDemoInviteNoticeText, resolveLivePhoneDemoConversationInviteCopy } from './live-phone-demo.invite-copy'

describe('live-phone-demo.invite-copy', () => {
  it('resolves Korean invite copy from a regional locale tag', () => {
    const copy = resolveLivePhoneDemoConversationInviteCopy('ko-KR')
    expect(copy.noticeTemplate).toBe('{inviterName}님이 {inviteeName}님을 초대했습니다.')
  })

  it('falls back to English for unsupported translated locales', () => {
    const copy = resolveLivePhoneDemoConversationInviteCopy('sv-SE')
    expect(copy.noticeTemplate).toBe('{inviterName} invited {inviteeName}.')
  })

  it('defines a notice template with both placeholders for all legal-document locales', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolveLivePhoneDemoConversationInviteCopy(locale)
      expect(copy.noticeTemplate).toContain('{inviterName}')
      expect(copy.noticeTemplate).toContain('{inviteeName}')
    }
  })

  it('substitutes both names into the notice template', () => {
    expect(formatLivePhoneDemoInviteNoticeText('ko-KR', '지영', '민수')).toBe('지영님이 민수님을 초대했습니다.')
    expect(formatLivePhoneDemoInviteNoticeText('en-US', 'Alice', 'Bob')).toBe('Alice invited Bob.')
  })
})
