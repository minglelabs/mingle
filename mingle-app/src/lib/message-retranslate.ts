import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { DEFAULT_LOCALE, resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from '@/i18n/config'

// The long-press menu's "translate again". The server replaces the stored
// translation for the whole room; this event lets the caller's own room show
// it at once instead of waiting for the next hydration.
export const MESSAGE_RETRANSLATED_EVENT = 'mingle:message-retranslated'
export type MessageRetranslatedEventDetail = {
  conversationId: string
  messageId: string
  language: string
  text: string
}

// Set once the one-time "long-press to translate again" tip was shown on this device.
export const RETRANSLATE_TIP_SHOWN_STORAGE_KEY = 'mingle_retranslate_tip_shown'

export type MessageRetranslateCopy = Record<'retranslate' | 'pending' | 'error' | 'noCoins' | 'tip', string>

const MESSAGE_RETRANSLATE_COPY_BY_LOCALE = {
  ko: { retranslate: "다시 번역", pending: "번역하는 중…", error: "다시 번역하지 못했습니다. 다시 시도해 주세요.", noCoins: "코인이 부족해 다시 번역할 수 없습니다.", tip: "번역이 어색하면 말풍선을 길게 눌러 '다시 번역'을 누르세요." },
  en: { retranslate: "Translate again", pending: "Translating…", error: "Could not translate again. Please try again.", noCoins: "Not enough coins to translate again.", tip: "If a translation sounds off, long-press the bubble and tap “Translate again”." },
  ja: { retranslate: "再翻訳", pending: "翻訳中…", error: "再翻訳できませんでした。もう一度お試しください。", noCoins: "コインが足りないため再翻訳できません。", tip: "翻訳が不自然なときは、吹き出しを長押しして「再翻訳」を押してください。" },
  'zh-CN': { retranslate: "重新翻译", pending: "正在翻译…", error: "无法重新翻译，请重试。", noCoins: "金币不足，无法重新翻译。", tip: "如果翻译不自然，长按气泡并点按“重新翻译”。" },
  'zh-TW': { retranslate: "重新翻譯", pending: "正在翻譯…", error: "無法重新翻譯，請再試一次。", noCoins: "金幣不足，無法重新翻譯。", tip: "如果翻譯不自然，長按對話框並點按「重新翻譯」。" },
  fr: { retranslate: "Retraduire", pending: "Traduction…", error: "Impossible de retraduire. Veuillez réessayer.", noCoins: "Pas assez de pièces pour retraduire.", tip: "Si une traduction semble étrange, appuyez longuement sur la bulle puis sur « Retraduire »." },
  de: { retranslate: "Neu übersetzen", pending: "Wird übersetzt…", error: "Neue Übersetzung fehlgeschlagen. Bitte versuche es erneut.", noCoins: "Nicht genug Münzen für eine neue Übersetzung.", tip: "Klingt eine Übersetzung seltsam, halte die Blase gedrückt und tippe auf „Neu übersetzen“." },
  es: { retranslate: "Traducir de nuevo", pending: "Traduciendo…", error: "No se pudo traducir de nuevo. Inténtalo otra vez.", noCoins: "No tienes monedas suficientes para traducir de nuevo.", tip: "Si una traducción suena rara, mantén pulsada la burbuja y toca «Traducir de nuevo»." },
  pt: { retranslate: "Traduzir novamente", pending: "Traduzindo…", error: "Não foi possível traduzir novamente. Tente outra vez.", noCoins: "Moedas insuficientes para traduzir novamente.", tip: "Se uma tradução parecer estranha, mantenha o balão pressionado e toque em “Traduzir novamente”." },
  it: { retranslate: "Traduci di nuovo", pending: "Traduzione…", error: "Impossibile tradurre di nuovo. Riprova.", noCoins: "Monete insufficienti per tradurre di nuovo.", tip: "Se una traduzione suona strana, tieni premuto il fumetto e tocca “Traduci di nuovo”." },
  ru: { retranslate: "Перевести заново", pending: "Перевод…", error: "Не удалось перевести заново. Попробуйте ещё раз.", noCoins: "Недостаточно монет, чтобы перевести заново.", tip: "Если перевод звучит странно, удерживайте сообщение и нажмите «Перевести заново»." },
  ar: { retranslate: "إعادة الترجمة", pending: "جارٍ الترجمة…", error: "تعذرت إعادة الترجمة. يُرجى المحاولة مرة أخرى.", noCoins: "لا توجد عملات كافية لإعادة الترجمة.", tip: "إذا بدت الترجمة غريبة، اضغط مطولًا على الفقاعة ثم اختر «إعادة الترجمة»." },
  hi: { retranslate: "फिर से अनुवाद करें", pending: "अनुवाद हो रहा है…", error: "फिर से अनुवाद नहीं हो सका। कृपया दोबारा कोशिश करें।", noCoins: "फिर से अनुवाद के लिए पर्याप्त सिक्के नहीं हैं।", tip: "अगर अनुवाद अजीब लगे, तो बबल को देर तक दबाएँ और “फिर से अनुवाद करें” पर टैप करें।" },
  th: { retranslate: "แปลใหม่", pending: "กำลังแปล…", error: "แปลใหม่ไม่ได้ โปรดลองอีกครั้ง", noCoins: "เหรียญไม่พอสำหรับการแปลใหม่", tip: "ถ้าคำแปลดูแปลก ให้กดค้างที่บับเบิลแล้วแตะ “แปลใหม่”" },
  vi: { retranslate: "Dịch lại", pending: "Đang dịch…", error: "Không thể dịch lại. Vui lòng thử lại.", noCoins: "Không đủ xu để dịch lại.", tip: "Nếu bản dịch nghe không tự nhiên, hãy nhấn giữ bong bóng rồi chọn “Dịch lại”." },
} satisfies Record<LegalDocumentLocale, MessageRetranslateCopy>

export function messageRetranslateCopy(locale: string): MessageRetranslateCopy {
  const supportedLocale = resolveSupportedLocaleTag(locale) ?? DEFAULT_LOCALE
  return MESSAGE_RETRANSLATE_COPY_BY_LOCALE[resolveLegalDocumentLocale(supportedLocale)] ?? MESSAGE_RETRANSLATE_COPY_BY_LOCALE.en
}

/** Applies a retranslated text to one utterance; the same object when nothing changes. */
export function applyRetranslationToUtterance<T extends { id: string; translations: Record<string, string>; translationFinalized?: Record<string, boolean> }>(
  utterance: T,
  detail: Pick<MessageRetranslatedEventDetail, 'messageId' | 'language' | 'text'>,
): T {
  if (utterance.id !== detail.messageId) return utterance
  const text = detail.text.trim()
  if (!text) return utterance
  // Write to the key the bubble already reads ("zh" and "zh-CN" style keys both occur).
  const canonical = canonicalizeTranslationLanguageCode(detail.language) || detail.language
  const key = Object.keys(utterance.translations).find((candidate) => (
    candidate === detail.language || canonicalizeTranslationLanguageCode(candidate) === canonical
  )) ?? detail.language
  if (utterance.translations[key] === text) return utterance
  return {
    ...utterance,
    translations: { ...utterance.translations, [key]: text },
    translationFinalized: { ...(utterance.translationFinalized || {}), [key]: true },
  }
}
