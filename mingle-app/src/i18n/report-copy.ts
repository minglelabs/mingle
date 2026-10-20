import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'
import type { ReportReason } from '@/server/reports/report-service'

/**
 * All user-facing copy for the report / hide / block / archive / delete flow,
 * in the 15 primary UI languages (same set as profile-bio-copy). Admin console
 * strings are NOT here — they follow the existing English-only admin
 * convention. Long translations (German especially) are kept short enough that
 * a single-line menu item or a sheet button does not clip.
 */
export type ReportCopy = {
  // ── Post "⋯" action menu ─────────────────────────────────────────────
  menuTitle: string
  edit: string
  archive: string
  delete: string
  reportPost: string
  reportAuthor: string
  hidePost: string
  blockAuthor: string
  cancel: string
  // Delete confirmation + trash notice
  deleteConfirmTitle: string
  deleteConfirmBody: string
  deleteConfirmAction: string
  actionFailed: string
  loginRequired: string
  // ── Report sheet ─────────────────────────────────────────────────────
  reportTitlePost: string
  reportTitleComment: string
  reportTitleUser: string
  reasonLabel: string
  detailLabel: string
  detailPlaceholder: string
  detailOptional: string
  submit: string
  submitting: string
  submitted: string
  alreadyReported: string
  reportError: string
  noAutoAction: string
  reasons: Record<ReportReason, string>
}

const copy: Record<LegalDocumentLocale, ReportCopy> = {
  ko: {
    menuTitle: '게시물 옵션', edit: '수정', archive: '보관', delete: '삭제',
    reportPost: '게시물 신고', reportAuthor: '작성자 신고', hidePost: '이 게시물 숨기기', blockAuthor: '작성자 차단', cancel: '취소',
    deleteConfirmTitle: '게시물을 삭제할까요?', deleteConfirmBody: '삭제한 게시물은 휴지통에서 30일 동안 복구할 수 있어요.', deleteConfirmAction: '삭제',
    actionFailed: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.', loginRequired: '로그인이 필요해요.',
    reportTitlePost: '게시물 신고', reportTitleComment: '댓글 신고', reportTitleUser: '사용자 신고',
    reasonLabel: '신고 사유', detailLabel: '상세 내용', detailPlaceholder: '상황을 자세히 적어 주세요.', detailOptional: '선택 입력 · 최대 500자',
    submit: '신고 보내기', submitting: '보내는 중…', submitted: '신고가 접수되었어요. 검토 후 처리됩니다.', alreadyReported: '이미 신고한 항목이에요.',
    reportError: '신고를 보내지 못했어요. 다시 시도해 주세요.', noAutoAction: '신고해도 숨김·차단은 자동으로 되지 않아요.',
    reasons: { spam: '스팸·도배', harassment: '괴롭힘·불쾌한 행동', inappropriate: '부적절한 콘텐츠', impersonation: '사칭', other: '기타' },
  },
  en: {
    menuTitle: 'Post options', edit: 'Edit', archive: 'Archive', delete: 'Delete',
    reportPost: 'Report post', reportAuthor: 'Report author', hidePost: 'Hide this post', blockAuthor: 'Block author', cancel: 'Cancel',
    deleteConfirmTitle: 'Delete this post?', deleteConfirmBody: 'Deleted posts can be restored from Trash for 30 days.', deleteConfirmAction: 'Delete',
    actionFailed: 'Something went wrong. Please try again.', loginRequired: 'Please sign in first.',
    reportTitlePost: 'Report post', reportTitleComment: 'Report comment', reportTitleUser: 'Report user',
    reasonLabel: 'Reason', detailLabel: 'Details', detailPlaceholder: 'Tell us what happened.', detailOptional: 'Optional · up to 500 characters',
    submit: 'Submit report', submitting: 'Submitting…', submitted: 'Your report was received and will be reviewed.', alreadyReported: 'You already reported this.',
    reportError: 'Could not submit the report. Please try again.', noAutoAction: 'Reporting does not hide or block anything by itself.',
    reasons: { spam: 'Spam', harassment: 'Harassment', inappropriate: 'Inappropriate content', impersonation: 'Impersonation', other: 'Other' },
  },
  ja: {
    menuTitle: '投稿オプション', edit: '編集', archive: 'アーカイブ', delete: '削除',
    reportPost: '投稿を報告', reportAuthor: '投稿者を報告', hidePost: 'この投稿を非表示', blockAuthor: '投稿者をブロック', cancel: 'キャンセル',
    deleteConfirmTitle: 'この投稿を削除しますか？', deleteConfirmBody: '削除した投稿はゴミ箱から30日間復元できます。', deleteConfirmAction: '削除',
    actionFailed: '処理できませんでした。時間をおいて再試行してください。', loginRequired: 'ログインが必要です。',
    reportTitlePost: '投稿を報告', reportTitleComment: 'コメントを報告', reportTitleUser: 'ユーザーを報告',
    reasonLabel: '報告理由', detailLabel: '詳細', detailPlaceholder: '状況を詳しくお書きください。', detailOptional: '任意・最大500文字',
    submit: '報告する', submitting: '送信中…', submitted: '報告を受け付けました。確認のうえ対応します。', alreadyReported: 'すでに報告済みです。',
    reportError: '報告を送信できませんでした。再試行してください。', noAutoAction: '報告しても自動で非表示・ブロックはされません。',
    reasons: { spam: 'スパム', harassment: '嫌がらせ', inappropriate: '不適切なコンテンツ', impersonation: 'なりすまし', other: 'その他' },
  },
  'zh-CN': {
    menuTitle: '帖子选项', edit: '编辑', archive: '归档', delete: '删除',
    reportPost: '举报帖子', reportAuthor: '举报作者', hidePost: '隐藏此帖子', blockAuthor: '拉黑作者', cancel: '取消',
    deleteConfirmTitle: '删除这条帖子？', deleteConfirmBody: '已删除的帖子可在回收站中恢复，保留30天。', deleteConfirmAction: '删除',
    actionFailed: '操作失败，请稍后重试。', loginRequired: '请先登录。',
    reportTitlePost: '举报帖子', reportTitleComment: '举报评论', reportTitleUser: '举报用户',
    reasonLabel: '举报原因', detailLabel: '详细说明', detailPlaceholder: '请详细描述发生了什么。', detailOptional: '选填 · 最多500字',
    submit: '提交举报', submitting: '提交中…', submitted: '举报已收到，我们将进行审核。', alreadyReported: '你已举报过此项。',
    reportError: '举报提交失败，请重试。', noAutoAction: '举报不会自动隐藏或拉黑。',
    reasons: { spam: '垃圾信息', harassment: '骚扰', inappropriate: '不当内容', impersonation: '冒充', other: '其他' },
  },
  'zh-TW': {
    menuTitle: '貼文選項', edit: '編輯', archive: '封存', delete: '刪除',
    reportPost: '檢舉貼文', reportAuthor: '檢舉作者', hidePost: '隱藏此貼文', blockAuthor: '封鎖作者', cancel: '取消',
    deleteConfirmTitle: '刪除這則貼文？', deleteConfirmBody: '已刪除的貼文可在垃圾桶中復原，保留30天。', deleteConfirmAction: '刪除',
    actionFailed: '操作失敗，請稍後再試。', loginRequired: '請先登入。',
    reportTitlePost: '檢舉貼文', reportTitleComment: '檢舉留言', reportTitleUser: '檢舉使用者',
    reasonLabel: '檢舉原因', detailLabel: '詳細說明', detailPlaceholder: '請詳細描述發生了什麼。', detailOptional: '選填 · 最多500字',
    submit: '送出檢舉', submitting: '傳送中…', submitted: '檢舉已收到，我們將進行審核。', alreadyReported: '你已檢舉過此項。',
    reportError: '檢舉傳送失敗，請重試。', noAutoAction: '檢舉不會自動隱藏或封鎖。',
    reasons: { spam: '垃圾訊息', harassment: '騷擾', inappropriate: '不當內容', impersonation: '冒充', other: '其他' },
  },
  fr: {
    menuTitle: 'Options', edit: 'Modifier', archive: 'Archiver', delete: 'Supprimer',
    reportPost: 'Signaler le post', reportAuthor: 'Signaler l’auteur', hidePost: 'Masquer ce post', blockAuthor: 'Bloquer l’auteur', cancel: 'Annuler',
    deleteConfirmTitle: 'Supprimer ce post ?', deleteConfirmBody: 'Les posts supprimés sont récupérables 30 jours dans la corbeille.', deleteConfirmAction: 'Supprimer',
    actionFailed: 'Une erreur est survenue. Réessayez.', loginRequired: 'Veuillez vous connecter.',
    reportTitlePost: 'Signaler le post', reportTitleComment: 'Signaler le commentaire', reportTitleUser: 'Signaler l’utilisateur',
    reasonLabel: 'Motif', detailLabel: 'Détails', detailPlaceholder: 'Décrivez ce qui s’est passé.', detailOptional: 'Facultatif · 500 caractères max.',
    submit: 'Envoyer le signalement', submitting: 'Envoi…', submitted: 'Signalement reçu, il sera examiné.', alreadyReported: 'Vous l’avez déjà signalé.',
    reportError: 'Échec de l’envoi du signalement. Réessayez.', noAutoAction: 'Un signalement ne masque ni ne bloque rien automatiquement.',
    reasons: { spam: 'Spam', harassment: 'Harcèlement', inappropriate: 'Contenu inapproprié', impersonation: 'Usurpation d’identité', other: 'Autre' },
  },
  de: {
    menuTitle: 'Optionen', edit: 'Bearbeiten', archive: 'Archivieren', delete: 'Löschen',
    reportPost: 'Beitrag melden', reportAuthor: 'Autor melden', hidePost: 'Beitrag ausblenden', blockAuthor: 'Autor blockieren', cancel: 'Abbrechen',
    deleteConfirmTitle: 'Beitrag löschen?', deleteConfirmBody: 'Gelöschte Beiträge sind 30 Tage im Papierkorb wiederherstellbar.', deleteConfirmAction: 'Löschen',
    actionFailed: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.', loginRequired: 'Bitte zuerst anmelden.',
    reportTitlePost: 'Beitrag melden', reportTitleComment: 'Kommentar melden', reportTitleUser: 'Nutzer melden',
    reasonLabel: 'Grund', detailLabel: 'Details', detailPlaceholder: 'Beschreibe, was passiert ist.', detailOptional: 'Optional · max. 500 Zeichen',
    submit: 'Meldung senden', submitting: 'Wird gesendet…', submitted: 'Meldung eingegangen und wird geprüft.', alreadyReported: 'Bereits gemeldet.',
    reportError: 'Meldung fehlgeschlagen. Bitte erneut versuchen.', noAutoAction: 'Eine Meldung blendet nichts aus und blockiert niemanden automatisch.',
    reasons: { spam: 'Spam', harassment: 'Belästigung', inappropriate: 'Unangemessener Inhalt', impersonation: 'Identitätsdiebstahl', other: 'Sonstiges' },
  },
  es: {
    menuTitle: 'Opciones', edit: 'Editar', archive: 'Archivar', delete: 'Eliminar',
    reportPost: 'Denunciar publicación', reportAuthor: 'Denunciar al autor', hidePost: 'Ocultar esta publicación', blockAuthor: 'Bloquear al autor', cancel: 'Cancelar',
    deleteConfirmTitle: '¿Eliminar esta publicación?', deleteConfirmBody: 'Las publicaciones eliminadas se recuperan 30 días desde la papelera.', deleteConfirmAction: 'Eliminar',
    actionFailed: 'Algo salió mal. Inténtalo de nuevo.', loginRequired: 'Inicia sesión primero.',
    reportTitlePost: 'Denunciar publicación', reportTitleComment: 'Denunciar comentario', reportTitleUser: 'Denunciar usuario',
    reasonLabel: 'Motivo', detailLabel: 'Detalles', detailPlaceholder: 'Cuéntanos qué pasó.', detailOptional: 'Opcional · máx. 500 caracteres',
    submit: 'Enviar denuncia', submitting: 'Enviando…', submitted: 'Denuncia recibida, será revisada.', alreadyReported: 'Ya lo denunciaste.',
    reportError: 'No se pudo enviar la denuncia. Inténtalo de nuevo.', noAutoAction: 'Denunciar no oculta ni bloquea nada por sí solo.',
    reasons: { spam: 'Spam', harassment: 'Acoso', inappropriate: 'Contenido inapropiado', impersonation: 'Suplantación', other: 'Otro' },
  },
  pt: {
    menuTitle: 'Opções', edit: 'Editar', archive: 'Arquivar', delete: 'Excluir',
    reportPost: 'Denunciar publicação', reportAuthor: 'Denunciar autor', hidePost: 'Ocultar esta publicação', blockAuthor: 'Bloquear autor', cancel: 'Cancelar',
    deleteConfirmTitle: 'Excluir esta publicação?', deleteConfirmBody: 'Publicações excluídas podem ser restauradas por 30 dias na lixeira.', deleteConfirmAction: 'Excluir',
    actionFailed: 'Algo deu errado. Tente novamente.', loginRequired: 'Faça login primeiro.',
    reportTitlePost: 'Denunciar publicação', reportTitleComment: 'Denunciar comentário', reportTitleUser: 'Denunciar usuário',
    reasonLabel: 'Motivo', detailLabel: 'Detalhes', detailPlaceholder: 'Conte o que aconteceu.', detailOptional: 'Opcional · até 500 caracteres',
    submit: 'Enviar denúncia', submitting: 'Enviando…', submitted: 'Denúncia recebida e será analisada.', alreadyReported: 'Você já denunciou isto.',
    reportError: 'Não foi possível enviar a denúncia. Tente novamente.', noAutoAction: 'Denunciar não oculta nem bloqueia nada automaticamente.',
    reasons: { spam: 'Spam', harassment: 'Assédio', inappropriate: 'Conteúdo impróprio', impersonation: 'Falsidade ideológica', other: 'Outro' },
  },
  it: {
    menuTitle: 'Opzioni', edit: 'Modifica', archive: 'Archivia', delete: 'Elimina',
    reportPost: 'Segnala post', reportAuthor: 'Segnala autore', hidePost: 'Nascondi questo post', blockAuthor: 'Blocca autore', cancel: 'Annulla',
    deleteConfirmTitle: 'Eliminare questo post?', deleteConfirmBody: 'I post eliminati sono recuperabili dal cestino per 30 giorni.', deleteConfirmAction: 'Elimina',
    actionFailed: 'Qualcosa è andato storto. Riprova.', loginRequired: 'Accedi prima.',
    reportTitlePost: 'Segnala post', reportTitleComment: 'Segnala commento', reportTitleUser: 'Segnala utente',
    reasonLabel: 'Motivo', detailLabel: 'Dettagli', detailPlaceholder: 'Raccontaci cosa è successo.', detailOptional: 'Facoltativo · max 500 caratteri',
    submit: 'Invia segnalazione', submitting: 'Invio…', submitted: 'Segnalazione ricevuta, sarà esaminata.', alreadyReported: 'L’hai già segnalato.',
    reportError: 'Impossibile inviare la segnalazione. Riprova.', noAutoAction: 'La segnalazione non nasconde né blocca nulla automaticamente.',
    reasons: { spam: 'Spam', harassment: 'Molestie', inappropriate: 'Contenuto inappropriato', impersonation: 'Furto d’identità', other: 'Altro' },
  },
  ru: {
    menuTitle: 'Параметры', edit: 'Изменить', archive: 'В архив', delete: 'Удалить',
    reportPost: 'Пожаловаться на пост', reportAuthor: 'Пожаловаться на автора', hidePost: 'Скрыть этот пост', blockAuthor: 'Заблокировать автора', cancel: 'Отмена',
    deleteConfirmTitle: 'Удалить этот пост?', deleteConfirmBody: 'Удалённые посты можно восстановить из корзины в течение 30 дней.', deleteConfirmAction: 'Удалить',
    actionFailed: 'Что-то пошло не так. Повторите попытку.', loginRequired: 'Сначала войдите в аккаунт.',
    reportTitlePost: 'Жалоба на пост', reportTitleComment: 'Жалоба на комментарий', reportTitleUser: 'Жалоба на пользователя',
    reasonLabel: 'Причина', detailLabel: 'Подробности', detailPlaceholder: 'Опишите, что произошло.', detailOptional: 'Необязательно · до 500 символов',
    submit: 'Отправить жалобу', submitting: 'Отправка…', submitted: 'Жалоба принята и будет рассмотрена.', alreadyReported: 'Вы уже пожаловались.',
    reportError: 'Не удалось отправить жалобу. Повторите попытку.', noAutoAction: 'Жалоба сама по себе ничего не скрывает и не блокирует.',
    reasons: { spam: 'Спам', harassment: 'Домогательства', inappropriate: 'Неприемлемый контент', impersonation: 'Выдача себя за другого', other: 'Другое' },
  },
  ar: {
    menuTitle: 'خيارات', edit: 'تعديل', archive: 'أرشفة', delete: 'حذف',
    reportPost: 'الإبلاغ عن المنشور', reportAuthor: 'الإبلاغ عن الكاتب', hidePost: 'إخفاء هذا المنشور', blockAuthor: 'حظر الكاتب', cancel: 'إلغاء',
    deleteConfirmTitle: 'حذف هذا المنشور؟', deleteConfirmBody: 'يمكن استعادة المنشورات المحذوفة من سلة المهملات خلال 30 يومًا.', deleteConfirmAction: 'حذف',
    actionFailed: 'حدث خطأ ما. حاول مرة أخرى.', loginRequired: 'يرجى تسجيل الدخول أولاً.',
    reportTitlePost: 'الإبلاغ عن المنشور', reportTitleComment: 'الإبلاغ عن التعليق', reportTitleUser: 'الإبلاغ عن المستخدم',
    reasonLabel: 'السبب', detailLabel: 'التفاصيل', detailPlaceholder: 'أخبرنا بما حدث.', detailOptional: 'اختياري · حتى 500 حرف',
    submit: 'إرسال البلاغ', submitting: 'جارٍ الإرسال…', submitted: 'تم استلام بلاغك وسيُراجَع.', alreadyReported: 'لقد أبلغت عن هذا بالفعل.',
    reportError: 'تعذّر إرسال البلاغ. حاول مرة أخرى.', noAutoAction: 'الإبلاغ لا يخفي ولا يحظر أي شيء تلقائيًا.',
    reasons: { spam: 'رسائل مزعجة', harassment: 'تحرش', inappropriate: 'محتوى غير لائق', impersonation: 'انتحال هوية', other: 'أخرى' },
  },
  hi: {
    menuTitle: 'विकल्प', edit: 'संपादित करें', archive: 'संग्रह', delete: 'हटाएँ',
    reportPost: 'पोस्ट की रिपोर्ट करें', reportAuthor: 'लेखक की रिपोर्ट करें', hidePost: 'यह पोस्ट छिपाएँ', blockAuthor: 'लेखक को ब्लॉक करें', cancel: 'रद्द करें',
    deleteConfirmTitle: 'यह पोस्ट हटाएँ?', deleteConfirmBody: 'हटाई गई पोस्ट को 30 दिनों तक ट्रैश से पुनर्स्थापित किया जा सकता है।', deleteConfirmAction: 'हटाएँ',
    actionFailed: 'कुछ गड़बड़ हुई। फिर से प्रयास करें।', loginRequired: 'पहले साइन इन करें।',
    reportTitlePost: 'पोस्ट की रिपोर्ट करें', reportTitleComment: 'टिप्पणी की रिपोर्ट करें', reportTitleUser: 'उपयोगकर्ता की रिपोर्ट करें',
    reasonLabel: 'कारण', detailLabel: 'विवरण', detailPlaceholder: 'बताएँ कि क्या हुआ।', detailOptional: 'वैकल्पिक · अधिकतम 500 अक्षर',
    submit: 'रिपोर्ट भेजें', submitting: 'भेजा जा रहा है…', submitted: 'आपकी रिपोर्ट मिल गई और इसकी समीक्षा की जाएगी।', alreadyReported: 'आप इसकी रिपोर्ट पहले ही कर चुके हैं।',
    reportError: 'रिपोर्ट नहीं भेजी जा सकी। फिर से प्रयास करें।', noAutoAction: 'रिपोर्ट करने से कुछ भी अपने आप छिपता या ब्लॉक नहीं होता।',
    reasons: { spam: 'स्पैम', harassment: 'उत्पीड़न', inappropriate: 'अनुचित सामग्री', impersonation: 'प्रतिरूपण', other: 'अन्य' },
  },
  th: {
    menuTitle: 'ตัวเลือก', edit: 'แก้ไข', archive: 'เก็บเข้าคลัง', delete: 'ลบ',
    reportPost: 'รายงานโพสต์', reportAuthor: 'รายงานผู้เขียน', hidePost: 'ซ่อนโพสต์นี้', blockAuthor: 'บล็อกผู้เขียน', cancel: 'ยกเลิก',
    deleteConfirmTitle: 'ลบโพสต์นี้ไหม', deleteConfirmBody: 'โพสต์ที่ลบสามารถกู้คืนได้จากถังขยะภายใน 30 วัน', deleteConfirmAction: 'ลบ',
    actionFailed: 'มีบางอย่างผิดพลาด โปรดลองอีกครั้ง', loginRequired: 'กรุณาเข้าสู่ระบบก่อน',
    reportTitlePost: 'รายงานโพสต์', reportTitleComment: 'รายงานความคิดเห็น', reportTitleUser: 'รายงานผู้ใช้',
    reasonLabel: 'เหตุผล', detailLabel: 'รายละเอียด', detailPlaceholder: 'บอกเราว่าเกิดอะไรขึ้น', detailOptional: 'ไม่บังคับ · สูงสุด 500 อักขระ',
    submit: 'ส่งรายงาน', submitting: 'กำลังส่ง…', submitted: 'ได้รับรายงานของคุณแล้ว และจะตรวจสอบ', alreadyReported: 'คุณรายงานรายการนี้ไปแล้ว',
    reportError: 'ส่งรายงานไม่สำเร็จ โปรดลองอีกครั้ง', noAutoAction: 'การรายงานจะไม่ซ่อนหรือบล็อกสิ่งใดโดยอัตโนมัติ',
    reasons: { spam: 'สแปม', harassment: 'การคุกคาม', inappropriate: 'เนื้อหาไม่เหมาะสม', impersonation: 'การแอบอ้าง', other: 'อื่น ๆ' },
  },
  vi: {
    menuTitle: 'Tùy chọn', edit: 'Chỉnh sửa', archive: 'Lưu trữ', delete: 'Xóa',
    reportPost: 'Báo cáo bài viết', reportAuthor: 'Báo cáo tác giả', hidePost: 'Ẩn bài viết này', blockAuthor: 'Chặn tác giả', cancel: 'Hủy',
    deleteConfirmTitle: 'Xóa bài viết này?', deleteConfirmBody: 'Bài viết đã xóa có thể khôi phục từ Thùng rác trong 30 ngày.', deleteConfirmAction: 'Xóa',
    actionFailed: 'Đã xảy ra lỗi. Vui lòng thử lại.', loginRequired: 'Vui lòng đăng nhập trước.',
    reportTitlePost: 'Báo cáo bài viết', reportTitleComment: 'Báo cáo bình luận', reportTitleUser: 'Báo cáo người dùng',
    reasonLabel: 'Lý do', detailLabel: 'Chi tiết', detailPlaceholder: 'Hãy cho chúng tôi biết chuyện gì đã xảy ra.', detailOptional: 'Tùy chọn · tối đa 500 ký tự',
    submit: 'Gửi báo cáo', submitting: 'Đang gửi…', submitted: 'Đã nhận báo cáo của bạn và sẽ được xem xét.', alreadyReported: 'Bạn đã báo cáo mục này rồi.',
    reportError: 'Không thể gửi báo cáo. Vui lòng thử lại.', noAutoAction: 'Báo cáo không tự động ẩn hoặc chặn bất kỳ điều gì.',
    reasons: { spam: 'Spam', harassment: 'Quấy rối', inappropriate: 'Nội dung không phù hợp', impersonation: 'Mạo danh', other: 'Khác' },
  },
}

export function reportCopy(locale: string): ReportCopy {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}
