import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Hearts on a profile (owner, 2026-11-25): the button on a profile, and the pill and list on My page. */
export type ProfileLikesCopy = {
  /** The heart button, not sent yet / already sent (screen readers). */
  send: string;
  sent: string;
  /** Title of the list on My page. */
  listTitle: string;
  failed: string;
  close: string;
};

const COPY: Record<PrimaryUiLocale, ProfileLikesCopy> = {
  ko: { send: "하트 보내기", sent: "하트를 보냈어요", listTitle: "나에게 하트를 보낸 사람", failed: "잠시 후 다시 시도해 주세요.", close: "닫기" },
  en: { send: "Send a heart", sent: "Heart sent", listTitle: "People who sent you a heart", failed: "Please try again in a moment.", close: "Close" },
  ja: { send: "ハートを送る", sent: "ハートを送りました", listTitle: "あなたにハートを送った人", failed: "しばらくしてからもう一度お試しください。", close: "閉じる" },
  "zh-CN": { send: "送出爱心", sent: "已送出爱心", listTitle: "给你送爱心的人", failed: "请稍后再试。", close: "关闭" },
  "zh-TW": { send: "送出愛心", sent: "已送出愛心", listTitle: "送你愛心的人", failed: "請稍後再試。", close: "關閉" },
  fr: { send: "Envoyer un cœur", sent: "Cœur envoyé", listTitle: "Ils vous ont envoyé un cœur", failed: "Réessayez dans un instant.", close: "Fermer" },
  de: { send: "Herz senden", sent: "Herz gesendet", listTitle: "Wer dir ein Herz geschickt hat", failed: "Bitte gleich noch einmal versuchen.", close: "Schließen" },
  es: { send: "Enviar un corazón", sent: "Corazón enviado", listTitle: "Quién te envió un corazón", failed: "Inténtalo de nuevo en un momento.", close: "Cerrar" },
  pt: { send: "Enviar um coração", sent: "Coração enviado", listTitle: "Quem enviou um coração para você", failed: "Tente de novo daqui a pouco.", close: "Fechar" },
  it: { send: "Invia un cuore", sent: "Cuore inviato", listTitle: "Chi ti ha inviato un cuore", failed: "Riprova tra poco.", close: "Chiudi" },
  ru: { send: "Отправить сердце", sent: "Сердце отправлено", listTitle: "Кто отправил вам сердце", failed: "Попробуйте чуть позже.", close: "Закрыть" },
  ar: { send: "إرسال قلب", sent: "تم إرسال القلب", listTitle: "من أرسلوا لك قلبًا", failed: "حاول مرة أخرى بعد قليل.", close: "إغلاق" },
  hi: { send: "दिल भेजें", sent: "दिल भेज दिया", listTitle: "जिन्होंने आपको दिल भेजा", failed: "थोड़ी देर बाद फिर कोशिश करें।", close: "बंद करें" },
  th: { send: "ส่งหัวใจ", sent: "ส่งหัวใจแล้ว", listTitle: "คนที่ส่งหัวใจให้คุณ", failed: "ลองใหม่อีกครั้งในอีกสักครู่", close: "ปิด" },
  vi: { send: "Gửi tim", sent: "Đã gửi tim", listTitle: "Những người đã gửi tim cho bạn", failed: "Hãy thử lại sau ít phút.", close: "Đóng" },
};

export function resolveProfileLikesCopy(rawLocale: string): ProfileLikesCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
