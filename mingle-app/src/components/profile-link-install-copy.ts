import {
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from "@/i18n/config";

export type ProfileLinkInstallLocale = LegalDocumentLocale;

export type ProfileLinkInstallCopy = {
  title: string;
  openInApp: string;
  appStore: string;
  playStore: string;
  invalidTitle: string;
  invalidDescription: string;
  userFallback: string;
};

function readLanguageTagQuality(part: string, index: number): { tag: string; quality: number; index: number } | null {
  const [rawTag, ...parameters] = part.trim().split(";");
  const tag = rawTag?.trim().toLowerCase();
  if (!tag) return null;

  const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith("q="));
  const parsedQuality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
  const quality = Number.isFinite(parsedQuality) ? Math.max(0, Math.min(1, parsedQuality)) : 0;

  return { tag, quality, index };
}

export function resolveProfileLinkInstallLocale(
  acceptLanguage: string | null | undefined,
): ProfileLinkInstallLocale {
  const candidates = (acceptLanguage || "")
    .split(",")
    .map(readLanguageTagQuality)
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const candidate of candidates) {
    const supportedLocale = resolveSupportedLocaleTag(candidate.tag);
    if (supportedLocale) return resolveLegalDocumentLocale(supportedLocale);
  }

  return "en";
}

export function getProfileLinkInstallCopy(locale: ProfileLinkInstallLocale): ProfileLinkInstallCopy {
  return PROFILE_LINK_INSTALL_COPY_BY_LOCALE[locale] ?? PROFILE_LINK_INSTALL_COPY_BY_LOCALE.en;
}

const PROFILE_LINK_INSTALL_COPY_BY_LOCALE: Record<ProfileLinkInstallLocale, ProfileLinkInstallCopy> = {
  ko: {
    title: "HashChat에서 프로필 열기", openInApp: "HashChat 앱에서 열기", appStore: "App Store에서 설치", playStore: "Google Play에서 설치",
    invalidTitle: "잘못된 프로필 링크입니다", invalidDescription: "QR 코드가 손상되었거나 더 이상 사용할 수 없는 링크입니다.", userFallback: "HashChat 사용자",
  },
  en: {
    title: "Open profile in HashChat", openInApp: "Open in HashChat", appStore: "App Store", playStore: "Google Play",
    invalidTitle: "This profile link is invalid", invalidDescription: "The QR code may be damaged or the link is no longer available.", userFallback: "HashChat user",
  },
  ja: {
    title: "HashChatでプロフィールを開く", openInApp: "HashChatで開く", appStore: "App Storeからインストール", playStore: "Google Playからインストール",
    invalidTitle: "このプロフィールリンクは無効です", invalidDescription: "QRコードが破損しているか、リンクが利用できなくなっています。", userFallback: "HashChatユーザー",
  },
  "zh-CN": {
    title: "在 HashChat 中打开个人资料", openInApp: "在 HashChat 中打开", appStore: "从 App Store 安装", playStore: "从 Google Play 安装",
    invalidTitle: "此个人资料链接无效", invalidDescription: "二维码可能已损坏，或链接已不可用。", userFallback: "HashChat 用户",
  },
  "zh-TW": {
    title: "在 HashChat 中開啟個人檔案", openInApp: "在 HashChat 中開啟", appStore: "從 App Store 安裝", playStore: "從 Google Play 安裝",
    invalidTitle: "此個人檔案連結無效", invalidDescription: "QR 碼可能已損壞，或連結已無法使用。", userFallback: "HashChat 使用者",
  },
  fr: {
    title: "Ouvrir le profil dans HashChat", openInApp: "Ouvrir dans HashChat", appStore: "Installer depuis l’App Store", playStore: "Installer depuis Google Play",
    invalidTitle: "Ce lien de profil est invalide", invalidDescription: "Le QR code est peut-être endommagé ou le lien n’est plus disponible.", userFallback: "Utilisateur HashChat",
  },
  de: {
    title: "Profil in HashChat öffnen", openInApp: "In HashChat öffnen", appStore: "Im App Store installieren", playStore: "Bei Google Play installieren",
    invalidTitle: "Dieser Profillink ist ungültig", invalidDescription: "Der QR-Code ist möglicherweise beschädigt oder der Link nicht mehr verfügbar.", userFallback: "HashChat-Nutzer",
  },
  es: {
    title: "Abrir perfil en HashChat", openInApp: "Abrir en HashChat", appStore: "Instalar desde App Store", playStore: "Instalar desde Google Play",
    invalidTitle: "Este enlace de perfil no es válido", invalidDescription: "El código QR puede estar dañado o el enlace ya no está disponible.", userFallback: "Usuario de HashChat",
  },
  pt: {
    title: "Abrir perfil no HashChat", openInApp: "Abrir no HashChat", appStore: "Instalar pela App Store", playStore: "Instalar pelo Google Play",
    invalidTitle: "Este link de perfil é inválido", invalidDescription: "O código QR pode estar danificado ou o link não está mais disponível.", userFallback: "Usuário do HashChat",
  },
  it: {
    title: "Apri il profilo in HashChat", openInApp: "Apri in HashChat", appStore: "Installa dall’App Store", playStore: "Installa da Google Play",
    invalidTitle: "Questo link del profilo non è valido", invalidDescription: "Il codice QR potrebbe essere danneggiato o il link non è più disponibile.", userFallback: "Utente HashChat",
  },
  ru: {
    title: "Открыть профиль в HashChat", openInApp: "Открыть в HashChat", appStore: "Установить из App Store", playStore: "Установить из Google Play",
    invalidTitle: "Ссылка на профиль недействительна", invalidDescription: "QR-код может быть повреждён или ссылка больше недоступна.", userFallback: "Пользователь HashChat",
  },
  ar: {
    title: "فتح الملف الشخصي في HashChat", openInApp: "فتح في HashChat", appStore: "التثبيت من App Store", playStore: "التثبيت من Google Play",
    invalidTitle: "رابط الملف الشخصي غير صالح", invalidDescription: "قد يكون رمز QR تالفًا أو لم يعد الرابط متاحًا.", userFallback: "مستخدم HashChat",
  },
  hi: {
    title: "HashChat में प्रोफ़ाइल खोलें", openInApp: "HashChat में खोलें", appStore: "App Store से इंस्टॉल करें", playStore: "Google Play से इंस्टॉल करें",
    invalidTitle: "यह प्रोफ़ाइल लिंक मान्य नहीं है", invalidDescription: "QR कोड खराब हो सकता है या लिंक अब उपलब्ध नहीं है।", userFallback: "HashChat उपयोगकर्ता",
  },
  th: {
    title: "เปิดโปรไฟล์ใน HashChat", openInApp: "เปิดใน HashChat", appStore: "ติดตั้งจาก App Store", playStore: "ติดตั้งจาก Google Play",
    invalidTitle: "ลิงก์โปรไฟล์นี้ไม่ถูกต้อง", invalidDescription: "คิวอาร์โค้ดอาจเสียหายหรือลิงก์ไม่พร้อมใช้งานแล้ว", userFallback: "ผู้ใช้ HashChat",
  },
  vi: {
    title: "Mở hồ sơ trong HashChat", openInApp: "Mở trong HashChat", appStore: "Cài đặt từ App Store", playStore: "Cài đặt từ Google Play",
    invalidTitle: "Liên kết hồ sơ này không hợp lệ", invalidDescription: "Mã QR có thể bị hỏng hoặc liên kết không còn khả dụng.", userFallback: "Người dùng HashChat",
  },
};
