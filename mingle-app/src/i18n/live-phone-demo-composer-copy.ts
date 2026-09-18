import { DEFAULT_LOCALE, resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from "@/i18n/config";

export type LivePhoneDemoComposerCopy = {
  manualSpeakerLabel: string;
  switchToKeyboardModeLabel: string;
  switchToVoiceModeLabel: string;
  composerPlaceholder: string;
  sendMessageLabel: string;
  blockedComposerMessage: string;
};

const COMPOSER_COPY_BY_LOCALE = {
  ko: {
    manualSpeakerLabel: "나",
    switchToKeyboardModeLabel: "키보드 모드로 전환",
    switchToVoiceModeLabel: "음성 모드로 전환",
    composerPlaceholder: "메시지를 입력하세요",
    sendMessageLabel: "메시지 보내기",
    blockedComposerMessage: "차단된 사용자입니다",
  },
  en: {
    manualSpeakerLabel: "You",
    switchToKeyboardModeLabel: "Switch to keyboard mode",
    switchToVoiceModeLabel: "Switch to voice mode",
    composerPlaceholder: "Type a message",
    sendMessageLabel: "Send message",
    blockedComposerMessage: "This user is blocked.",
  },
  ja: {
    manualSpeakerLabel: "自分",
    switchToKeyboardModeLabel: "キーボードモードに切り替え",
    switchToVoiceModeLabel: "音声モードに切り替え",
    composerPlaceholder: "メッセージを入力",
    sendMessageLabel: "メッセージを送信",
    blockedComposerMessage: "このユーザーはブロックされています。",
  },
  "zh-CN": {
    manualSpeakerLabel: "我",
    switchToKeyboardModeLabel: "切换到键盘模式",
    switchToVoiceModeLabel: "切换到语音模式",
    composerPlaceholder: "输入消息",
    sendMessageLabel: "发送消息",
    blockedComposerMessage: "该用户已被屏蔽。",
  },
  "zh-TW": {
    manualSpeakerLabel: "我",
    switchToKeyboardModeLabel: "切換到鍵盤模式",
    switchToVoiceModeLabel: "切換到語音模式",
    composerPlaceholder: "輸入訊息",
    sendMessageLabel: "傳送訊息",
    blockedComposerMessage: "此使用者已被封鎖。",
  },
  fr: {
    manualSpeakerLabel: "Moi",
    switchToKeyboardModeLabel: "Passer au mode clavier",
    switchToVoiceModeLabel: "Passer au mode vocal",
    composerPlaceholder: "Saisissez un message",
    sendMessageLabel: "Envoyer le message",
    blockedComposerMessage: "Cet utilisateur est bloqué.",
  },
  de: {
    manualSpeakerLabel: "Ich",
    switchToKeyboardModeLabel: "In den Tastaturmodus wechseln",
    switchToVoiceModeLabel: "In den Sprachmodus wechseln",
    composerPlaceholder: "Nachricht eingeben",
    sendMessageLabel: "Nachricht senden",
    blockedComposerMessage: "Dieser Nutzer ist blockiert.",
  },
  es: {
    manualSpeakerLabel: "Yo",
    switchToKeyboardModeLabel: "Cambiar al modo de teclado",
    switchToVoiceModeLabel: "Cambiar al modo de voz",
    composerPlaceholder: "Escribe un mensaje",
    sendMessageLabel: "Enviar mensaje",
    blockedComposerMessage: "Este usuario está bloqueado.",
  },
  pt: {
    manualSpeakerLabel: "Eu",
    switchToKeyboardModeLabel: "Mudar para o modo de teclado",
    switchToVoiceModeLabel: "Mudar para o modo de voz",
    composerPlaceholder: "Digite uma mensagem",
    sendMessageLabel: "Enviar mensagem",
    blockedComposerMessage: "Este usuário está bloqueado.",
  },
  it: {
    manualSpeakerLabel: "Io",
    switchToKeyboardModeLabel: "Passa alla modalità tastiera",
    switchToVoiceModeLabel: "Passa alla modalità vocale",
    composerPlaceholder: "Scrivi un messaggio",
    sendMessageLabel: "Invia messaggio",
    blockedComposerMessage: "Questo utente è bloccato.",
  },
  ru: {
    manualSpeakerLabel: "Я",
    switchToKeyboardModeLabel: "Переключить в режим клавиатуры",
    switchToVoiceModeLabel: "Переключить в голосовой режим",
    composerPlaceholder: "Введите сообщение",
    sendMessageLabel: "Отправить сообщение",
    blockedComposerMessage: "Этот пользователь заблокирован.",
  },
  ar: {
    manualSpeakerLabel: "أنا",
    switchToKeyboardModeLabel: "التبديل إلى وضع لوحة المفاتيح",
    switchToVoiceModeLabel: "التبديل إلى الوضع الصوتي",
    composerPlaceholder: "اكتب رسالة",
    sendMessageLabel: "إرسال الرسالة",
    blockedComposerMessage: "تم حظر هذا المستخدم.",
  },
  hi: {
    manualSpeakerLabel: "मैं",
    switchToKeyboardModeLabel: "कीबोर्ड मोड पर जाएँ",
    switchToVoiceModeLabel: "वॉइस मोड पर जाएँ",
    composerPlaceholder: "संदेश लिखें",
    sendMessageLabel: "संदेश भेजें",
    blockedComposerMessage: "इस उपयोगकर्ता को ब्लॉक किया गया है।",
  },
  th: {
    manualSpeakerLabel: "ฉัน",
    switchToKeyboardModeLabel: "เปลี่ยนเป็นโหมดคีย์บอร์ด",
    switchToVoiceModeLabel: "เปลี่ยนเป็นโหมดเสียง",
    composerPlaceholder: "พิมพ์ข้อความ",
    sendMessageLabel: "ส่งข้อความ",
    blockedComposerMessage: "ผู้ใช้นี้ถูกบล็อก",
  },
  vi: {
    manualSpeakerLabel: "Tôi",
    switchToKeyboardModeLabel: "Chuyển sang chế độ bàn phím",
    switchToVoiceModeLabel: "Chuyển sang chế độ giọng nói",
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
