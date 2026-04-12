import { DEFAULT_LOCALE, resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from "@/i18n/config";

export type LivePhoneDemoComposerCopy = {
  manualSpeakerLabel: string;
  openKeyboardLabel: string;
  closeKeyboardLabel: string;
  composerPlaceholder: string;
  sendMessageLabel: string;
};

const COMPOSER_COPY_BY_LOCALE = {
  ko: {
    manualSpeakerLabel: "나",
    openKeyboardLabel: "텍스트 입력 열기",
    closeKeyboardLabel: "텍스트 입력 닫기",
    composerPlaceholder: "메시지를 입력하세요",
    sendMessageLabel: "메시지 보내기",
  },
  en: {
    manualSpeakerLabel: "You",
    openKeyboardLabel: "Open text input",
    closeKeyboardLabel: "Close text input",
    composerPlaceholder: "Type a message",
    sendMessageLabel: "Send message",
  },
  ja: {
    manualSpeakerLabel: "自分",
    openKeyboardLabel: "テキスト入力を開く",
    closeKeyboardLabel: "テキスト入力を閉じる",
    composerPlaceholder: "メッセージを入力",
    sendMessageLabel: "メッセージを送信",
  },
  "zh-CN": {
    manualSpeakerLabel: "我",
    openKeyboardLabel: "打开文字输入",
    closeKeyboardLabel: "关闭文字输入",
    composerPlaceholder: "输入消息",
    sendMessageLabel: "发送消息",
  },
  "zh-TW": {
    manualSpeakerLabel: "我",
    openKeyboardLabel: "開啟文字輸入",
    closeKeyboardLabel: "關閉文字輸入",
    composerPlaceholder: "輸入訊息",
    sendMessageLabel: "傳送訊息",
  },
  fr: {
    manualSpeakerLabel: "Moi",
    openKeyboardLabel: "Ouvrir la saisie texte",
    closeKeyboardLabel: "Fermer la saisie texte",
    composerPlaceholder: "Saisissez un message",
    sendMessageLabel: "Envoyer le message",
  },
  de: {
    manualSpeakerLabel: "Ich",
    openKeyboardLabel: "Texteingabe öffnen",
    closeKeyboardLabel: "Texteingabe schließen",
    composerPlaceholder: "Nachricht eingeben",
    sendMessageLabel: "Nachricht senden",
  },
  es: {
    manualSpeakerLabel: "Yo",
    openKeyboardLabel: "Abrir entrada de texto",
    closeKeyboardLabel: "Cerrar entrada de texto",
    composerPlaceholder: "Escribe un mensaje",
    sendMessageLabel: "Enviar mensaje",
  },
  pt: {
    manualSpeakerLabel: "Eu",
    openKeyboardLabel: "Abrir entrada de texto",
    closeKeyboardLabel: "Fechar entrada de texto",
    composerPlaceholder: "Digite uma mensagem",
    sendMessageLabel: "Enviar mensagem",
  },
  it: {
    manualSpeakerLabel: "Io",
    openKeyboardLabel: "Apri input di testo",
    closeKeyboardLabel: "Chiudi input di testo",
    composerPlaceholder: "Scrivi un messaggio",
    sendMessageLabel: "Invia messaggio",
  },
  ru: {
    manualSpeakerLabel: "Я",
    openKeyboardLabel: "Открыть ввод текста",
    closeKeyboardLabel: "Закрыть ввод текста",
    composerPlaceholder: "Введите сообщение",
    sendMessageLabel: "Отправить сообщение",
  },
  ar: {
    manualSpeakerLabel: "أنا",
    openKeyboardLabel: "فتح إدخال النص",
    closeKeyboardLabel: "إغلاق إدخال النص",
    composerPlaceholder: "اكتب رسالة",
    sendMessageLabel: "إرسال الرسالة",
  },
  hi: {
    manualSpeakerLabel: "मैं",
    openKeyboardLabel: "टेक्स्ट इनपुट खोलें",
    closeKeyboardLabel: "टेक्स्ट इनपुट बंद करें",
    composerPlaceholder: "संदेश लिखें",
    sendMessageLabel: "संदेश भेजें",
  },
  th: {
    manualSpeakerLabel: "ฉัน",
    openKeyboardLabel: "เปิดการพิมพ์ข้อความ",
    closeKeyboardLabel: "ปิดการพิมพ์ข้อความ",
    composerPlaceholder: "พิมพ์ข้อความ",
    sendMessageLabel: "ส่งข้อความ",
  },
  vi: {
    manualSpeakerLabel: "Tôi",
    openKeyboardLabel: "Mở nhập văn bản",
    closeKeyboardLabel: "Đóng nhập văn bản",
    composerPlaceholder: "Nhập tin nhắn",
    sendMessageLabel: "Gửi tin nhắn",
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoComposerCopy>;

export function resolveLivePhoneDemoComposerCopy(
  uiLocale: string,
): LivePhoneDemoComposerCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE;
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale);

  return COMPOSER_COPY_BY_LOCALE[resolvedLocale] ?? COMPOSER_COPY_BY_LOCALE.en;
}
