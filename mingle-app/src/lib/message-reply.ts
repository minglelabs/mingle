import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n/config'

// A reply carries a small snapshot of the message it quotes, so the quote
// renders even when the original is outside the loaded history. Stored in the
// sending client's event metadata (`clientMetadata.replyTo`) and echoed back
// through hydration and realtime frames.
export type MessageReplyReference = {
  id: string
  text: string
  translations?: Record<string, string>
  speakerName?: string | null
  speakerUserId?: string | null
  image?: true
  recalled?: true
}

export const MESSAGE_REPLY_TEXT_LIMIT = 160
const MAX_ID_LENGTH = 256
const MAX_NAME_LENGTH = 80
const MAX_TRANSLATIONS = 12

function clip(value: string, limit: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed
}

function readString(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  const clipped = clip(value, limit)
  return clipped || null
}

// Untrusted on both ends (client metadata is user-controlled), so every field
// is re-validated and clipped wherever a reference is read.
export function normalizeMessageReplyReference(raw: unknown): MessageReplyReference | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id || id.length > MAX_ID_LENGTH) return null
  const recalled = record.recalled === true
  const image = record.image === true
  const text = recalled ? '' : readString(record.text, MESSAGE_REPLY_TEXT_LIMIT) ?? ''
  const translations: Record<string, string> = {}
  if (!recalled && record.translations && typeof record.translations === 'object' && !Array.isArray(record.translations)) {
    for (const [language, value] of Object.entries(record.translations as Record<string, unknown>)) {
      if (Object.keys(translations).length >= MAX_TRANSLATIONS) break
      const clipped = readString(value, MESSAGE_REPLY_TEXT_LIMIT)
      if (language && language.length <= 16 && clipped) translations[language] = clipped
    }
  }
  if (!text && !image && !recalled) return null
  const speakerName = readString(record.speakerName, MAX_NAME_LENGTH)
  const speakerUserId = readString(record.speakerUserId, MAX_ID_LENGTH)
  return {
    id,
    text,
    ...(Object.keys(translations).length ? { translations } : {}),
    ...(speakerName ? { speakerName } : {}),
    ...(speakerUserId ? { speakerUserId } : {}),
    ...(image ? { image: true as const } : {}),
    ...(recalled ? { recalled: true as const } : {}),
  }
}

// Keeps who was quoted but drops the unsent message's text and translations.
export function toRecalledMessageReplyReference(reference: MessageReplyReference): MessageReplyReference {
  return {
    id: reference.id,
    text: '',
    ...(reference.speakerName ? { speakerName: reference.speakerName } : {}),
    ...(reference.speakerUserId ? { speakerUserId: reference.speakerUserId } : {}),
    recalled: true,
  }
}

export function buildMessageReplyReference(utterance: {
  id: string
  originalText: string
  originalDisplayText?: string
  translations?: Record<string, string>
  speakerName?: string | null
  speaker?: string
  speakerUserId?: string | null
  image?: unknown
}): MessageReplyReference | null {
  return normalizeMessageReplyReference({
    id: utterance.id,
    text: utterance.originalDisplayText || utterance.originalText,
    translations: utterance.translations,
    speakerName: utterance.speakerName || utterance.speaker || null,
    speakerUserId: utterance.speakerUserId ?? null,
    image: Boolean(utterance.image) || undefined,
  })
}

// The quoted text in the first display language that has it, else the original.
export function resolveMessageReplyPreviewText(
  reference: MessageReplyReference,
  displayLanguages: readonly (string | null | undefined)[],
): string {
  for (const language of displayLanguages) {
    if (!language) continue
    const translated = reference.translations?.[language]
    if (translated) return translated
  }
  return reference.text
}

export type MessageReplyCopy = Record<'reply' | 'replyingTo' | 'cancelReply' | 'you' | 'photo' | 'deleted' | 'jumpToOriginal', string>

const MESSAGE_REPLY_COPY_BY_LOCALE = {
  ko: { reply: "답장", replyingTo: "{name}에게 답장", cancelReply: "답장 취소", you: "나", photo: "사진", deleted: "삭제된 메시지입니다", jumpToOriginal: "원본 메시지로 이동" },
  en: { reply: "Reply", replyingTo: "Replying to {name}", cancelReply: "Cancel reply", you: "You", photo: "Photo", deleted: "This message was deleted", jumpToOriginal: "Go to original message" },
  ja: { reply: "返信", replyingTo: "{name}に返信", cancelReply: "返信をキャンセル", you: "自分", photo: "写真", deleted: "削除されたメッセージです", jumpToOriginal: "元のメッセージへ移動" },
  'zh-CN': { reply: "回复", replyingTo: "回复 {name}", cancelReply: "取消回复", you: "我", photo: "照片", deleted: "此消息已被删除", jumpToOriginal: "跳到原消息" },
  'zh-TW': { reply: "回覆", replyingTo: "回覆 {name}", cancelReply: "取消回覆", you: "我", photo: "照片", deleted: "此訊息已被刪除", jumpToOriginal: "跳到原訊息" },
  fr: { reply: "Répondre", replyingTo: "Réponse à {name}", cancelReply: "Annuler la réponse", you: "Vous", photo: "Photo", deleted: "Ce message a été supprimé", jumpToOriginal: "Aller au message d’origine" },
  de: { reply: "Antworten", replyingTo: "Antwort an {name}", cancelReply: "Antwort abbrechen", you: "Du", photo: "Foto", deleted: "Diese Nachricht wurde gelöscht", jumpToOriginal: "Zur ursprünglichen Nachricht" },
  es: { reply: "Responder", replyingTo: "Respondiendo a {name}", cancelReply: "Cancelar respuesta", you: "Tú", photo: "Foto", deleted: "Este mensaje se eliminó", jumpToOriginal: "Ir al mensaje original" },
  pt: { reply: "Responder", replyingTo: "Respondendo a {name}", cancelReply: "Cancelar resposta", you: "Você", photo: "Foto", deleted: "Esta mensagem foi apagada", jumpToOriginal: "Ir para a mensagem original" },
  it: { reply: "Rispondi", replyingTo: "Risposta a {name}", cancelReply: "Annulla risposta", you: "Tu", photo: "Foto", deleted: "Questo messaggio è stato eliminato", jumpToOriginal: "Vai al messaggio originale" },
  ru: { reply: "Ответить", replyingTo: "Ответ для {name}", cancelReply: "Отменить ответ", you: "Вы", photo: "Фото", deleted: "Сообщение удалено", jumpToOriginal: "К исходному сообщению" },
  ar: { reply: "رد", replyingTo: "الرد على {name}", cancelReply: "إلغاء الرد", you: "أنت", photo: "صورة", deleted: "تم حذف هذه الرسالة", jumpToOriginal: "الانتقال إلى الرسالة الأصلية" },
  hi: { reply: "जवाब दें", replyingTo: "{name} को जवाब", cancelReply: "जवाब रद्द करें", you: "आप", photo: "फ़ोटो", deleted: "यह संदेश हटा दिया गया", jumpToOriginal: "मूल संदेश पर जाएँ" },
  th: { reply: "ตอบกลับ", replyingTo: "ตอบกลับ {name}", cancelReply: "ยกเลิกการตอบกลับ", you: "คุณ", photo: "รูปภาพ", deleted: "ข้อความนี้ถูกลบแล้ว", jumpToOriginal: "ไปที่ข้อความต้นฉบับ" },
  vi: { reply: "Trả lời", replyingTo: "Trả lời {name}", cancelReply: "Hủy trả lời", you: "Bạn", photo: "Ảnh", deleted: "Tin nhắn này đã bị xóa", jumpToOriginal: "Đến tin nhắn gốc" },
} satisfies Record<LegalDocumentLocale, MessageReplyCopy>

export function resolveMessageReplyCopy(uiLocale: string): MessageReplyCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  return MESSAGE_REPLY_COPY_BY_LOCALE[resolveLegalDocumentLocale(supportedLocale)] ?? MESSAGE_REPLY_COPY_BY_LOCALE.en
}
