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
  signInAttachedTitle: string
  signInAttachedBody: string
}

const COPY_BY_LOCALE: Record<LegalDocumentLocale, TeamNotificationCopy> = {
  ko: {
    feedbackReplyTitle: '피드백에 답변이 도착했어요',
    reportReplyTitle: '신고에 답변이 도착했어요',
    reportStatusTitle: '신고 처리 결과',
    reportResolvedBody: '신고하신 내용을 검토하고 조치를 완료했습니다.',
    reportRejectedBody: '신고하신 내용을 검토했지만 조치 대상에 해당하지 않았습니다.',
    signInAttachedTitle: '새 로그인 수단이 연결됐어요',
    signInAttachedBody: '내가 한 것이 아니라면 설정의 로그인 수단에서 뗄 수 있어요.',
  },
  en: {
    feedbackReplyTitle: 'Reply to your feedback',
    reportReplyTitle: 'Reply to your report',
    reportStatusTitle: 'Update on your report',
    reportResolvedBody: 'We reviewed your report and took action.',
    reportRejectedBody: 'We reviewed your report and found no violation.',
    signInAttachedTitle: 'A new sign-in method was added',
    signInAttachedBody: 'If this was not you, remove it under Sign-in methods in Settings.',
  },
  ja: {
    feedbackReplyTitle: 'フィードバックに返信が届きました',
    reportReplyTitle: '通報に返信が届きました',
    reportStatusTitle: '通報の処理結果',
    reportResolvedBody: '通報内容を確認し、対応を完了しました。',
    reportRejectedBody: '通報内容を確認しましたが、違反は確認されませんでした。',
    signInAttachedTitle: '新しいログイン方法が追加されました',
    signInAttachedBody: '心当たりがない場合は、設定の「ログイン方法」から解除できます。',
  },
  'zh-CN': {
    feedbackReplyTitle: '你的反馈有新回复',
    reportReplyTitle: '你的举报有新回复',
    reportStatusTitle: '举报处理结果',
    reportResolvedBody: '我们已审核你的举报并完成处理。',
    reportRejectedBody: '我们已审核你的举报，未发现违规。',
    signInAttachedTitle: '已添加新的登录方式',
    signInAttachedBody: '如果不是你本人操作，可以在设置的“登录方式”中移除。',
  },
  'zh-TW': {
    feedbackReplyTitle: '你的意見回饋有新回覆',
    reportReplyTitle: '你的檢舉有新回覆',
    reportStatusTitle: '檢舉處理結果',
    reportResolvedBody: '我們已審核你的檢舉並完成處理。',
    reportRejectedBody: '我們已審核你的檢舉，未發現違規。',
    signInAttachedTitle: '已新增登入方式',
    signInAttachedBody: '如果不是你本人操作，可以在設定的「登入方式」中移除。',
  },
  fr: {
    feedbackReplyTitle: 'Réponse à votre commentaire',
    reportReplyTitle: 'Réponse à votre signalement',
    reportStatusTitle: 'Suite de votre signalement',
    reportResolvedBody: 'Nous avons examiné votre signalement et pris des mesures.',
    reportRejectedBody: 'Nous avons examiné votre signalement et n’avons constaté aucune infraction.',
    signInAttachedTitle: 'Un nouveau moyen de connexion a été ajouté',
    signInAttachedBody: 'Si ce n’était pas vous, retirez-le dans Réglages > Moyens de connexion.',
  },
  de: {
    feedbackReplyTitle: 'Antwort auf Ihr Feedback',
    reportReplyTitle: 'Antwort auf Ihre Meldung',
    reportStatusTitle: 'Update zu Ihrer Meldung',
    reportResolvedBody: 'Wir haben Ihre Meldung geprüft und Maßnahmen ergriffen.',
    reportRejectedBody: 'Wir haben Ihre Meldung geprüft und keinen Verstoß festgestellt.',
    signInAttachedTitle: 'Eine neue Anmeldemethode wurde hinzugefügt',
    signInAttachedBody: 'Wenn Sie das nicht waren, entfernen Sie sie in den Einstellungen unter „Anmeldemethoden“.',
  },
  es: {
    feedbackReplyTitle: 'Respuesta a tus comentarios',
    reportReplyTitle: 'Respuesta a tu denuncia',
    reportStatusTitle: 'Novedades sobre tu denuncia',
    reportResolvedBody: 'Revisamos tu denuncia y tomamos medidas.',
    reportRejectedBody: 'Revisamos tu denuncia y no encontramos ninguna infracción.',
    signInAttachedTitle: 'Se añadió un nuevo método de inicio de sesión',
    signInAttachedBody: 'Si no fuiste tú, quítalo en Ajustes > Métodos de inicio de sesión.',
  },
  pt: {
    feedbackReplyTitle: 'Resposta ao seu feedback',
    reportReplyTitle: 'Resposta à sua denúncia',
    reportStatusTitle: 'Atualização da sua denúncia',
    reportResolvedBody: 'Analisamos sua denúncia e tomamos providências.',
    reportRejectedBody: 'Analisamos sua denúncia e não encontramos nenhuma violação.',
    signInAttachedTitle: 'Um novo método de login foi adicionado',
    signInAttachedBody: 'Se não foi você, remova-o em Ajustes > Métodos de login.',
  },
  it: {
    feedbackReplyTitle: 'Risposta al tuo feedback',
    reportReplyTitle: 'Risposta alla tua segnalazione',
    reportStatusTitle: 'Aggiornamento sulla tua segnalazione',
    reportResolvedBody: 'Abbiamo esaminato la tua segnalazione e preso provvedimenti.',
    reportRejectedBody: 'Abbiamo esaminato la tua segnalazione e non abbiamo riscontrato violazioni.',
    signInAttachedTitle: 'È stato aggiunto un nuovo metodo di accesso',
    signInAttachedBody: 'Se non sei stato tu, rimuovilo in Impostazioni > Metodi di accesso.',
  },
  ru: {
    feedbackReplyTitle: 'Ответ на ваш отзыв',
    reportReplyTitle: 'Ответ на вашу жалобу',
    reportStatusTitle: 'Результат рассмотрения жалобы',
    reportResolvedBody: 'Мы рассмотрели вашу жалобу и приняли меры.',
    reportRejectedBody: 'Мы рассмотрели вашу жалобу и не обнаружили нарушений.',
    signInAttachedTitle: 'Добавлен новый способ входа',
    signInAttachedBody: 'Если это были не вы, удалите его в настройках в разделе «Способы входа».',
  },
  ar: {
    feedbackReplyTitle: 'رد على ملاحظاتك',
    reportReplyTitle: 'رد على بلاغك',
    reportStatusTitle: 'تحديث بخصوص بلاغك',
    reportResolvedBody: 'راجعنا بلاغك واتخذنا الإجراء اللازم.',
    reportRejectedBody: 'راجعنا بلاغك ولم نجد أي مخالفة.',
    signInAttachedTitle: 'تمت إضافة طريقة تسجيل دخول جديدة',
    signInAttachedBody: 'إن لم تكن أنت من فعل ذلك، يمكنك إزالتها من «طرق تسجيل الدخول» في الإعدادات.',
  },
  hi: {
    feedbackReplyTitle: 'आपके फ़ीडबैक का जवाब आया है',
    reportReplyTitle: 'आपकी रिपोर्ट का जवाब आया है',
    reportStatusTitle: 'आपकी रिपोर्ट पर अपडेट',
    reportResolvedBody: 'हमने आपकी रिपोर्ट की समीक्षा की और कार्रवाई की।',
    reportRejectedBody: 'हमने आपकी रिपोर्ट की समीक्षा की और कोई उल्लंघन नहीं पाया।',
    signInAttachedTitle: 'नया साइन-इन तरीका जोड़ा गया',
    signInAttachedBody: 'अगर यह आपने नहीं किया, तो सेटिंग्स के «साइन-इन के तरीके» में जाकर इसे हटा दें।',
  },
  th: {
    feedbackReplyTitle: 'มีคำตอบสำหรับความคิดเห็นของคุณ',
    reportReplyTitle: 'มีคำตอบสำหรับรายงานของคุณ',
    reportStatusTitle: 'ผลการดำเนินการกับรายงานของคุณ',
    reportResolvedBody: 'เราได้ตรวจสอบรายงานของคุณและดำเนินการแล้ว',
    reportRejectedBody: 'เราได้ตรวจสอบรายงานของคุณแล้วและไม่พบการละเมิด',
    signInAttachedTitle: 'มีการเพิ่มวิธีเข้าสู่ระบบใหม่',
    signInAttachedBody: 'หากไม่ใช่คุณ สามารถลบออกได้ที่ “วิธีเข้าสู่ระบบ” ในการตั้งค่า',
  },
  vi: {
    feedbackReplyTitle: 'Phản hồi cho góp ý của bạn',
    reportReplyTitle: 'Phản hồi cho báo cáo của bạn',
    reportStatusTitle: 'Cập nhật về báo cáo của bạn',
    reportResolvedBody: 'Chúng tôi đã xem xét báo cáo của bạn và đã xử lý.',
    reportRejectedBody: 'Chúng tôi đã xem xét báo cáo của bạn và không phát hiện vi phạm.',
    signInAttachedTitle: 'Đã thêm phương thức đăng nhập mới',
    signInAttachedBody: 'Nếu không phải bạn, hãy gỡ trong Cài đặt > Phương thức đăng nhập.',
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
  if (type === 'sign_in_attached') return { title: copy.signInAttachedTitle, body: copy.signInAttachedBody }
  return {
    title: copy.reportStatusTitle,
    body: isNotifiedReportStatus(text)
      ? (text === 'resolved' ? copy.reportResolvedBody : copy.reportRejectedBody)
      : '',
  }
}
