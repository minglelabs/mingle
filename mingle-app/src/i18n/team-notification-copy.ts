import type { LegalDocumentLocale } from '@/i18n/config'
import {
  isNotifiedReportStatus,
  type TeamNotificationType,
} from '@/lib/user-notification-types'

// Shared by the in-app notification list and the push sender, so both read
// the same.
export type TeamNotificationCopy = {
  feedbackReplyTitle: string
  reportReplyTitle: string
  reportStatusTitle: string
  reportResolvedBody: string
  reportRejectedBody: string
  postRemovedTitle: string
  postRemovedBody: string
}

const COPY_BY_LOCALE: Record<LegalDocumentLocale, TeamNotificationCopy> = {
  ko: {
    feedbackReplyTitle: '피드백에 답변이 도착했어요',
    reportReplyTitle: '신고에 답변이 도착했어요',
    reportStatusTitle: '신고 처리 결과',
    reportResolvedBody: '신고하신 내용을 검토하고 조치를 완료했습니다.',
    reportRejectedBody: '신고하신 내용을 검토했지만 조치 대상에 해당하지 않았습니다.',
    postRemovedTitle: '게시물이 삭제되었어요',
    postRemovedBody: '회원님의 게시물이 신고되어 검토한 결과, 이용규칙 위반으로 삭제 처리되었습니다.',
  },
  en: {
    feedbackReplyTitle: 'Reply to your feedback',
    reportReplyTitle: 'Reply to your report',
    reportStatusTitle: 'Update on your report',
    reportResolvedBody: 'We reviewed your report and took action.',
    reportRejectedBody: 'We reviewed your report and found no violation.',
    postRemovedTitle: 'Your post was removed',
    postRemovedBody: 'Your post was reported, and after review it was removed for breaking our community rules.',
  },
  ja: {
    feedbackReplyTitle: 'フィードバックに返信が届きました',
    reportReplyTitle: '通報に返信が届きました',
    reportStatusTitle: '通報の処理結果',
    reportResolvedBody: '通報内容を確認し、対応を完了しました。',
    reportRejectedBody: '通報内容を確認しましたが、違反は確認されませんでした。',
    postRemovedTitle: '投稿が削除されました',
    postRemovedBody: 'あなたの投稿が通報され、確認の結果、利用ルール違反のため削除されました。',
  },
  'zh-CN': {
    feedbackReplyTitle: '你的反馈有新回复',
    reportReplyTitle: '你的举报有新回复',
    reportStatusTitle: '举报处理结果',
    reportResolvedBody: '我们已审核你的举报并完成处理。',
    reportRejectedBody: '我们已审核你的举报，未发现违规。',
    postRemovedTitle: '你的帖子已被删除',
    postRemovedBody: '你的帖子被举报，经审核违反了社区规则，已被删除。',
  },
  'zh-TW': {
    feedbackReplyTitle: '你的意見回饋有新回覆',
    reportReplyTitle: '你的檢舉有新回覆',
    reportStatusTitle: '檢舉處理結果',
    reportResolvedBody: '我們已審核你的檢舉並完成處理。',
    reportRejectedBody: '我們已審核你的檢舉，未發現違規。',
    postRemovedTitle: '你的貼文已被刪除',
    postRemovedBody: '你的貼文遭到檢舉，經審核違反社群規則，已被刪除。',
  },
  fr: {
    feedbackReplyTitle: 'Réponse à votre commentaire',
    reportReplyTitle: 'Réponse à votre signalement',
    reportStatusTitle: 'Suite de votre signalement',
    reportResolvedBody: 'Nous avons examiné votre signalement et pris des mesures.',
    reportRejectedBody: 'Nous avons examiné votre signalement et n’avons constaté aucune infraction.',
    postRemovedTitle: 'Votre publication a été supprimée',
    postRemovedBody: 'Votre publication a été signalée et, après examen, supprimée pour non-respect des règles de la communauté.',
  },
  de: {
    feedbackReplyTitle: 'Antwort auf Ihr Feedback',
    reportReplyTitle: 'Antwort auf Ihre Meldung',
    reportStatusTitle: 'Update zu Ihrer Meldung',
    reportResolvedBody: 'Wir haben Ihre Meldung geprüft und Maßnahmen ergriffen.',
    reportRejectedBody: 'Wir haben Ihre Meldung geprüft und keinen Verstoß festgestellt.',
    postRemovedTitle: 'Ihr Beitrag wurde entfernt',
    postRemovedBody: 'Ihr Beitrag wurde gemeldet und nach Prüfung wegen eines Verstoßes gegen die Community-Regeln entfernt.',
  },
  es: {
    feedbackReplyTitle: 'Respuesta a tus comentarios',
    reportReplyTitle: 'Respuesta a tu denuncia',
    reportStatusTitle: 'Novedades sobre tu denuncia',
    reportResolvedBody: 'Revisamos tu denuncia y tomamos medidas.',
    reportRejectedBody: 'Revisamos tu denuncia y no encontramos ninguna infracción.',
    postRemovedTitle: 'Tu publicación fue eliminada',
    postRemovedBody: 'Tu publicación fue denunciada y, tras revisarla, se eliminó por incumplir las normas de la comunidad.',
  },
  pt: {
    feedbackReplyTitle: 'Resposta ao seu feedback',
    reportReplyTitle: 'Resposta à sua denúncia',
    reportStatusTitle: 'Atualização da sua denúncia',
    reportResolvedBody: 'Analisamos sua denúncia e tomamos providências.',
    reportRejectedBody: 'Analisamos sua denúncia e não encontramos nenhuma violação.',
    postRemovedTitle: 'Sua publicação foi removida',
    postRemovedBody: 'Sua publicação foi denunciada e, após análise, removida por violar as regras da comunidade.',
  },
  it: {
    feedbackReplyTitle: 'Risposta al tuo feedback',
    reportReplyTitle: 'Risposta alla tua segnalazione',
    reportStatusTitle: 'Aggiornamento sulla tua segnalazione',
    reportResolvedBody: 'Abbiamo esaminato la tua segnalazione e preso provvedimenti.',
    reportRejectedBody: 'Abbiamo esaminato la tua segnalazione e non abbiamo riscontrato violazioni.',
    postRemovedTitle: 'Il tuo post è stato rimosso',
    postRemovedBody: 'Il tuo post è stato segnalato e, dopo la verifica, rimosso per violazione delle regole della community.',
  },
  ru: {
    feedbackReplyTitle: 'Ответ на ваш отзыв',
    reportReplyTitle: 'Ответ на вашу жалобу',
    reportStatusTitle: 'Результат рассмотрения жалобы',
    reportResolvedBody: 'Мы рассмотрели вашу жалобу и приняли меры.',
    reportRejectedBody: 'Мы рассмотрели вашу жалобу и не обнаружили нарушений.',
    postRemovedTitle: 'Ваша публикация удалена',
    postRemovedBody: 'На вашу публикацию поступила жалоба, и после проверки она удалена за нарушение правил сообщества.',
  },
  ar: {
    feedbackReplyTitle: 'رد على ملاحظاتك',
    reportReplyTitle: 'رد على بلاغك',
    reportStatusTitle: 'تحديث بخصوص بلاغك',
    reportResolvedBody: 'راجعنا بلاغك واتخذنا الإجراء اللازم.',
    reportRejectedBody: 'راجعنا بلاغك ولم نجد أي مخالفة.',
    postRemovedTitle: 'تمت إزالة منشورك',
    postRemovedBody: 'تم الإبلاغ عن منشورك، وبعد المراجعة تمت إزالته لمخالفته قواعد المجتمع.',
  },
  hi: {
    feedbackReplyTitle: 'आपके फ़ीडबैक का जवाब आया है',
    reportReplyTitle: 'आपकी रिपोर्ट का जवाब आया है',
    reportStatusTitle: 'आपकी रिपोर्ट पर अपडेट',
    reportResolvedBody: 'हमने आपकी रिपोर्ट की समीक्षा की और कार्रवाई की।',
    reportRejectedBody: 'हमने आपकी रिपोर्ट की समीक्षा की और कोई उल्लंघन नहीं पाया।',
    postRemovedTitle: 'आपकी पोस्ट हटा दी गई',
    postRemovedBody: 'आपकी पोस्ट की रिपोर्ट की गई थी, और समीक्षा के बाद समुदाय के नियमों का उल्लंघन करने के कारण उसे हटा दिया गया।',
  },
  th: {
    feedbackReplyTitle: 'มีคำตอบสำหรับความคิดเห็นของคุณ',
    reportReplyTitle: 'มีคำตอบสำหรับรายงานของคุณ',
    reportStatusTitle: 'ผลการดำเนินการกับรายงานของคุณ',
    reportResolvedBody: 'เราได้ตรวจสอบรายงานของคุณและดำเนินการแล้ว',
    reportRejectedBody: 'เราได้ตรวจสอบรายงานของคุณแล้วและไม่พบการละเมิด',
    postRemovedTitle: 'โพสต์ของคุณถูกลบแล้ว',
    postRemovedBody: 'โพสต์ของคุณถูกรายงาน และหลังจากตรวจสอบแล้วถูกลบเนื่องจากละเมิดกฎของชุมชน',
  },
  vi: {
    feedbackReplyTitle: 'Phản hồi cho góp ý của bạn',
    reportReplyTitle: 'Phản hồi cho báo cáo của bạn',
    reportStatusTitle: 'Cập nhật về báo cáo của bạn',
    reportResolvedBody: 'Chúng tôi đã xem xét báo cáo của bạn và đã xử lý.',
    reportRejectedBody: 'Chúng tôi đã xem xét báo cáo của bạn và không phát hiện vi phạm.',
    postRemovedTitle: 'Bài đăng của bạn đã bị gỡ',
    postRemovedBody: 'Bài đăng của bạn đã bị báo cáo và sau khi xem xét đã bị gỡ vì vi phạm quy tắc cộng đồng.',
  },
}

const COPY_BY_LOWERCASE_LOCALE = new Map(
  Object.entries(COPY_BY_LOCALE).map(([locale, copy]) => [locale.toLowerCase(), copy]),
)

// Accepts any stored language tag ("th", "zh-CN", "pt-BR"); English otherwise.
export function resolveTeamNotificationCopy(language: string | null | undefined): TeamNotificationCopy {
  const normalized = (language ?? '').trim().toLowerCase()
  return COPY_BY_LOWERCASE_LOCALE.get(normalized)
    ?? COPY_BY_LOWERCASE_LOCALE.get(normalized.split('-')[0] ?? '')
    ?? COPY_BY_LOCALE.en
}

// Title and text of one team notification. `body` is the reply text, or the
// new status for report_status.
export function resolveTeamNotificationText(
  copy: TeamNotificationCopy,
  type: TeamNotificationType,
  body: string | null | undefined,
): { title: string, body: string } {
  const text = (body ?? '').trim()
  if (type === 'feedback_reply') return { title: copy.feedbackReplyTitle, body: text }
  if (type === 'report_reply') return { title: copy.reportReplyTitle, body: text }
  if (type === 'post_removed') return { title: copy.postRemovedTitle, body: copy.postRemovedBody }
  return {
    title: copy.reportStatusTitle,
    body: isNotifiedReportStatus(text)
      ? (text === 'resolved' ? copy.reportResolvedBody : copy.reportRejectedBody)
      : '',
  }
}
