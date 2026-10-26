import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from "@/i18n/config";

// Screen-reader-only labels that don't belong to any one feature's copy.
export type AccessibilityCopy = Record<"preparingApp" | "checkingAccount" | "scrollToLatest" | "selectedLanguages", string>;

const ACCESSIBILITY_COPY_BY_LOCALE = {
  ko: { preparingApp: "Mingle 준비 중", checkingAccount: "계정 확인 중", scrollToLatest: "최신 메시지로 이동", selectedLanguages: "선택한 언어" },
  en: { preparingApp: "Preparing Mingle", checkingAccount: "Checking account", scrollToLatest: "Scroll to latest", selectedLanguages: "Selected languages" },
  ja: { preparingApp: "Mingleを準備中", checkingAccount: "アカウントを確認中", scrollToLatest: "最新のメッセージへ移動", selectedLanguages: "選択した言語" },
  "zh-CN": { preparingApp: "正在准备 Mingle", checkingAccount: "正在验证账号", scrollToLatest: "跳到最新消息", selectedLanguages: "已选语言" },
  "zh-TW": { preparingApp: "正在準備 Mingle", checkingAccount: "正在確認帳號", scrollToLatest: "跳到最新訊息", selectedLanguages: "已選語言" },
  fr: { preparingApp: "Préparation de Mingle", checkingAccount: "Vérification du compte", scrollToLatest: "Aller au dernier message", selectedLanguages: "Langues sélectionnées" },
  de: { preparingApp: "Mingle wird vorbereitet", checkingAccount: "Konto wird überprüft", scrollToLatest: "Zur neuesten Nachricht", selectedLanguages: "Ausgewählte Sprachen" },
  es: { preparingApp: "Preparando Mingle", checkingAccount: "Comprobando la cuenta", scrollToLatest: "Ir al último mensaje", selectedLanguages: "Idiomas seleccionados" },
  pt: { preparingApp: "Preparando o Mingle", checkingAccount: "Verificando a conta", scrollToLatest: "Ir para a mensagem mais recente", selectedLanguages: "Idiomas selecionados" },
  it: { preparingApp: "Preparazione di Mingle", checkingAccount: "Verifica dell’account", scrollToLatest: "Vai all’ultimo messaggio", selectedLanguages: "Lingue selezionate" },
  ru: { preparingApp: "Подготовка Mingle", checkingAccount: "Проверка аккаунта", scrollToLatest: "К последнему сообщению", selectedLanguages: "Выбранные языки" },
  ar: { preparingApp: "جارٍ تجهيز Mingle", checkingAccount: "جارٍ التحقق من الحساب", scrollToLatest: "الانتقال إلى أحدث رسالة", selectedLanguages: "اللغات المحددة" },
  hi: { preparingApp: "Mingle तैयार हो रहा है", checkingAccount: "खाते की जाँच हो रही है", scrollToLatest: "नवीनतम संदेश पर जाएँ", selectedLanguages: "चुनी गई भाषाएँ" },
  th: { preparingApp: "กำลังเตรียม Mingle", checkingAccount: "กำลังตรวจสอบบัญชี", scrollToLatest: "ไปที่ข้อความล่าสุด", selectedLanguages: "ภาษาที่เลือก" },
  vi: { preparingApp: "Đang chuẩn bị Mingle", checkingAccount: "Đang kiểm tra tài khoản", scrollToLatest: "Đến tin nhắn mới nhất", selectedLanguages: "Ngôn ngữ đã chọn" },
} satisfies Record<LegalDocumentLocale, AccessibilityCopy>;

export function resolveAccessibilityCopy(uiLocale: string): AccessibilityCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE;
  return ACCESSIBILITY_COPY_BY_LOCALE[resolveLegalDocumentLocale(supportedLocale)] ?? ACCESSIBILITY_COPY_BY_LOCALE.en;
}
