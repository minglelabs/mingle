import { DEFAULT_LOCALE, resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from "@/i18n/config";

export type LivePhoneDemoComposerCopy = {
  manualSpeakerLabel: string;
  openKeyboardLabel: string;
  closeKeyboardLabel: string;
  composerPlaceholder: string;
  sendMessageLabel: string;
  blockedComposerMessage: string;
};

const COMPOSER_COPY_BY_LOCALE = {
  ko: {
    manualSpeakerLabel: "나",
    openKeyboardLabel: "텍스트 입력 열기",
    closeKeyboardLabel: "텍스트 입력 닫기",
    composerPlaceholder: "메시지를 입력하세요",
    sendMessageLabel: "메시지 보내기",
    blockedComposerMessage: "차단된 사용자입니다",
  },
  en: {
    manualSpeakerLabel: "You",
    openKeyboardLabel: "Open text input",
    closeKeyboardLabel: "Close text input",
    composerPlaceholder: "Type a message",
    sendMessageLabel: "Send message",
    blockedComposerMessage: "This user is blocked.",
  },
  ja: {
    manualSpeakerLabel: "自分",
    openKeyboardLabel: "テキスト入力を開く",
    closeKeyboardLabel: "テキスト入力を閉じる",
    composerPlaceholder: "メッセージを入力",
    sendMessageLabel: "メッセージを送信",
    blockedComposerMessage: "このユーザーはブロックされています。",
  },
  "zh-CN": {
    manualSpeakerLabel: "我",
    openKeyboardLabel: "打开文字输入",
    closeKeyboardLabel: "关闭文字输入",
    composerPlaceholder: "输入消息",
    sendMessageLabel: "发送消息",
    blockedComposerMessage: "该用户已被屏蔽。",
  },
  "zh-TW": {
    manualSpeakerLabel: "我",
    openKeyboardLabel: "開啟文字輸入",
    closeKeyboardLabel: "關閉文字輸入",
    composerPlaceholder: "輸入訊息",
    sendMessageLabel: "傳送訊息",
    blockedComposerMessage: "此使用者已被封鎖。",
  },
  fr: {
    manualSpeakerLabel: "Moi",
    openKeyboardLabel: "Ouvrir la saisie texte",
    closeKeyboardLabel: "Fermer la saisie texte",
    composerPlaceholder: "Saisissez un message",
    sendMessageLabel: "Envoyer le message",
    blockedComposerMessage: "Cet utilisateur est bloqué.",
  },
  de: {
    manualSpeakerLabel: "Ich",
    openKeyboardLabel: "Texteingabe öffnen",
    closeKeyboardLabel: "Texteingabe schließen",
    composerPlaceholder: "Nachricht eingeben",
    sendMessageLabel: "Nachricht senden",
    blockedComposerMessage: "Dieser Nutzer ist blockiert.",
  },
  es: {
    manualSpeakerLabel: "Yo",
    openKeyboardLabel: "Abrir entrada de texto",
    closeKeyboardLabel: "Cerrar entrada de texto",
    composerPlaceholder: "Escribe un mensaje",
    sendMessageLabel: "Enviar mensaje",
    blockedComposerMessage: "Este usuario está bloqueado.",
  },
  pt: {
    manualSpeakerLabel: "Eu",
    openKeyboardLabel: "Abrir entrada de texto",
    closeKeyboardLabel: "Fechar entrada de texto",
    composerPlaceholder: "Digite uma mensagem",
    sendMessageLabel: "Enviar mensagem",
    blockedComposerMessage: "Este usuário está bloqueado.",
  },
  it: {
    manualSpeakerLabel: "Io",
    openKeyboardLabel: "Apri input di testo",
    closeKeyboardLabel: "Chiudi input di testo",
    composerPlaceholder: "Scrivi un messaggio",
    sendMessageLabel: "Invia messaggio",
    blockedComposerMessage: "Questo utente è bloccato.",
  },
  ru: {
    manualSpeakerLabel: "Я",
    openKeyboardLabel: "Открыть ввод текста",
    closeKeyboardLabel: "Закрыть ввод текста",
    composerPlaceholder: "Введите сообщение",
    sendMessageLabel: "Отправить сообщение",
    blockedComposerMessage: "Этот пользователь заблокирован.",
  },
  ar: {
    manualSpeakerLabel: "أنا",
    openKeyboardLabel: "فتح إدخال النص",
    closeKeyboardLabel: "إغلاق إدخال النص",
    composerPlaceholder: "اكتب رسالة",
    sendMessageLabel: "إرسال الرسالة",
    blockedComposerMessage: "تم حظر هذا المستخدم.",
  },
  hi: {
    manualSpeakerLabel: "मैं",
    openKeyboardLabel: "टेक्स्ट इनपुट खोलें",
    closeKeyboardLabel: "टेक्स्ट इनपुट बंद करें",
    composerPlaceholder: "संदेश लिखें",
    sendMessageLabel: "संदेश भेजें",
    blockedComposerMessage: "इस उपयोगकर्ता को ब्लॉक किया गया है।",
  },
  th: {
    manualSpeakerLabel: "ฉัน",
    openKeyboardLabel: "เปิดการพิมพ์ข้อความ",
    closeKeyboardLabel: "ปิดการพิมพ์ข้อความ",
    composerPlaceholder: "พิมพ์ข้อความ",
    sendMessageLabel: "ส่งข้อความ",
    blockedComposerMessage: "ผู้ใช้นี้ถูกบล็อก",
  },
  vi: {
    manualSpeakerLabel: "Tôi",
    openKeyboardLabel: "Mở nhập văn bản",
    closeKeyboardLabel: "Đóng nhập văn bản",
    composerPlaceholder: "Nhập tin nhắn",
    sendMessageLabel: "Gửi tin nhắn",
    blockedComposerMessage: "Người dùng này đã bị chặn.",
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoComposerCopy>;

export function resolveLivePhoneDemoComposerCopy(
  uiLocale: string,
): LivePhoneDemoComposerCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE;
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale);

  return COMPOSER_COPY_BY_LOCALE[resolvedLocale] ?? COMPOSER_COPY_BY_LOCALE.en;
}
