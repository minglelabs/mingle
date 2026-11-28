import { describe, expect, it } from 'vitest'
import { resolveTeamNotificationCopy, resolveTeamNotificationText } from './team-notification-copy'

describe('team notification copy', () => {
  it('resolves stored language tags case-insensitively, by base language, then English', () => {
    expect(resolveTeamNotificationCopy('th').feedbackReplyTitle).toBe('มีคำตอบสำหรับความคิดเห็นของคุณ')
    expect(resolveTeamNotificationCopy('zh-cn').reportReplyTitle).toBe('你的举报有新回复')
    expect(resolveTeamNotificationCopy('pt-BR').reportStatusTitle).toBe('Atualização da sua denúncia')
    expect(resolveTeamNotificationCopy('xx').feedbackReplyTitle).toBe('Reply to your feedback')
    expect(resolveTeamNotificationCopy(null).feedbackReplyTitle).toBe('Reply to your feedback')
  })

  it('uses the reply text for replies and a localized outcome for report statuses', () => {
    const copy = resolveTeamNotificationCopy('en')
    expect(resolveTeamNotificationText(copy, 'feedback_reply', ' Thanks! ')).toEqual({
      title: 'Reply to your feedback',
      body: 'Thanks!',
    })
    expect(resolveTeamNotificationText(copy, 'report_reply', 'We are on it')).toEqual({
      title: 'Reply to your report',
      body: 'We are on it',
    })
    expect(resolveTeamNotificationText(copy, 'report_status', 'resolved').body).toBe(copy.reportResolvedBody)
    expect(resolveTeamNotificationText(copy, 'report_status', 'rejected').body).toBe(copy.reportRejectedBody)
    expect(resolveTeamNotificationText(copy, 'report_status', 'open').body).toBe('')
  })

  it('tells a user their post was removed for breaking the community rules', () => {
    const ko = resolveTeamNotificationCopy('ko')
    expect(resolveTeamNotificationText(ko, 'post_removed', '')).toEqual({
      title: '게시물이 삭제되었어요',
      body: '회원님의 게시물이 신고되어 검토한 결과, 이용규칙 위반으로 삭제 처리되었습니다.',
    })
    expect(resolveTeamNotificationText(resolveTeamNotificationCopy('fr'), 'post_removed', '').title).toBe('Votre publication a été supprimée')
    expect(resolveTeamNotificationText(ko, 'post_removed', 'spam').body).toBe('회원님의 게시물이 신고되어 검토한 결과, 이용규칙 위반으로 삭제 처리되었습니다.\n신고 사유: 스팸·도배')
    expect(resolveTeamNotificationText(resolveTeamNotificationCopy('en'), 'post_removed', 'harassment').body).toMatch(/\nReason: Harassment$/)
  })
})
