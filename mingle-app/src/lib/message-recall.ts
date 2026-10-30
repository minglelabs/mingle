import { DEFAULT_LOCALE, resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from '@/i18n/config'

// A recalled ("unsent") message stays soft-deleted (`isDeleted`) so every
// existing visibility filter hides it; this metadata key is what tells a
// recall apart from a "clear my history" delete, so rooms can show a
// "deleted message" placeholder in its place.
export const MESSAGE_RECALLED_AT_METADATA_KEY = 'recalledAtMs'
export const MESSAGE_RECALLED_EVENT = 'mingle:message-recalled'
export type MessageRecalledEventDetail = { conversationId: string; messageId: string }
// Newest recalls a hydration response carries; older ones left every warm cache long ago.
export const RECALLED_MESSAGE_ID_LIMIT = 200

export function readMessageRecalledAtMs(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[MESSAGE_RECALLED_AT_METADATA_KEY]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function normalizeRecalledMessageIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256))]
}

export type MessageRecallCopy = Record<'recall' | 'confirm' | 'placeholder' | 'pending' | 'error', string>

const MESSAGE_RECALL_COPY_BY_LOCALE = {
  ko: { recall: "전송 취소", confirm: "한 번 더 눌러 모두에게서 삭제", placeholder: "삭제된 메시지입니다", pending: "취소하는 중…", error: "전송을 취소하지 못했습니다. 다시 시도해 주세요." },
  en: { recall: "Unsend", confirm: "Tap again to delete for everyone", placeholder: "This message was deleted", pending: "Unsending…", error: "Could not unsend the message. Please try again." },
  ja: { recall: "送信取消", confirm: "もう一度押すと全員から削除", placeholder: "削除されたメッセージです", pending: "取り消し中…", error: "送信を取り消せませんでした。もう一度お試しください。" },
  'zh-CN': { recall: "撤回", confirm: "再点一次即可为所有人删除", placeholder: "此消息已被删除", pending: "正在撤回…", error: "无法撤回消息，请重试。" },
  'zh-TW': { recall: "收回", confirm: "再點一次即可為所有人刪除", placeholder: "此訊息已被刪除", pending: "正在收回…", error: "無法收回訊息，請再試一次。" },
  fr: { recall: "Annuler l’envoi", confirm: "Appuyez à nouveau pour supprimer pour tous", placeholder: "Ce message a été supprimé", pending: "Annulation…", error: "Impossible d’annuler l’envoi. Veuillez réessayer." },
  de: { recall: "Senden zurücknehmen", confirm: "Erneut tippen, um für alle zu löschen", placeholder: "Diese Nachricht wurde gelöscht", pending: "Wird zurückgenommen…", error: "Nachricht konnte nicht zurückgenommen werden. Bitte versuche es erneut." },
  es: { recall: "Anular envío", confirm: "Toca de nuevo para eliminar para todos", placeholder: "Este mensaje se eliminó", pending: "Anulando…", error: "No se pudo anular el envío. Inténtalo de nuevo." },
  pt: { recall: "Cancelar envio", confirm: "Toque novamente para apagar para todos", placeholder: "Esta mensagem foi apagada", pending: "Cancelando…", error: "Não foi possível cancelar o envio. Tente novamente." },
  it: { recall: "Annulla invio", confirm: "Tocca di nuovo per eliminare per tutti", placeholder: "Questo messaggio è stato eliminato", pending: "Annullamento…", error: "Impossibile annullare l’invio. Riprova." },
  ru: { recall: "Отменить отправку", confirm: "Нажмите ещё раз, чтобы удалить у всех", placeholder: "Сообщение удалено", pending: "Отмена…", error: "Не удалось отменить отправку. Попробуйте ещё раз." },
  ar: { recall: "إلغاء الإرسال", confirm: "اضغط مرة أخرى للحذف لدى الجميع", placeholder: "تم حذف هذه الرسالة", pending: "جارٍ الإلغاء…", error: "تعذر إلغاء إرسال الرسالة. يُرجى المحاولة مرة أخرى." },
  hi: { recall: "भेजना रद्द करें", confirm: "सभी के लिए हटाने हेतु फिर से टैप करें", placeholder: "यह संदेश हटा दिया गया", pending: "रद्द किया जा रहा है…", error: "संदेश भेजना रद्द नहीं हो सका। कृपया फिर से कोशिश करें।" },
  th: { recall: "ยกเลิกการส่ง", confirm: "แตะอีกครั้งเพื่อลบสำหรับทุกคน", placeholder: "ข้อความนี้ถูกลบแล้ว", pending: "กำลังยกเลิก…", error: "ยกเลิกการส่งข้อความไม่ได้ โปรดลองอีกครั้ง" },
  vi: { recall: "Thu hồi", confirm: "Nhấn lần nữa để xóa với mọi người", placeholder: "Tin nhắn này đã bị xóa", pending: "Đang thu hồi…", error: "Không thể thu hồi tin nhắn. Vui lòng thử lại." },
} satisfies Record<LegalDocumentLocale, MessageRecallCopy>

export function messageRecallCopy(locale: string): MessageRecallCopy {
  const supportedLocale = resolveSupportedLocaleTag(locale) ?? DEFAULT_LOCALE
  return MESSAGE_RECALL_COPY_BY_LOCALE[resolveLegalDocumentLocale(supportedLocale)] ?? MESSAGE_RECALL_COPY_BY_LOCALE.en
}
