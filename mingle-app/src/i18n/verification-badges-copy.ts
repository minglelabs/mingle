import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** The verification chips on a profile (owner, 2026-11-25): one per check the account passed. */
export type VerificationBadgesCopy = {
  face: string;
  phone: string;
};

const COPY: Record<PrimaryUiLocale, VerificationBadgesCopy> = {
  ko: { face: "얼굴 인증", phone: "전화번호 인증" },
  en: { face: "Face verified", phone: "Phone verified" },
  ja: { face: "顔認証済み", phone: "電話番号認証済み" },
  "zh-CN": { face: "人脸已认证", phone: "手机号已认证" },
  "zh-TW": { face: "臉部已認證", phone: "手機號碼已認證" },
  fr: { face: "Visage vérifié", phone: "Téléphone vérifié" },
  de: { face: "Gesicht bestätigt", phone: "Telefon bestätigt" },
  es: { face: "Cara verificada", phone: "Teléfono verificado" },
  pt: { face: "Rosto verificado", phone: "Telefone verificado" },
  it: { face: "Volto verificato", phone: "Telefono verificato" },
  ru: { face: "Лицо подтверждено", phone: "Телефон подтверждён" },
  ar: { face: "الوجه موثّق", phone: "الهاتف موثّق" },
  hi: { face: "चेहरा सत्यापित", phone: "फ़ोन सत्यापित" },
  th: { face: "ยืนยันใบหน้าแล้ว", phone: "ยืนยันเบอร์โทรแล้ว" },
  vi: { face: "Đã xác minh khuôn mặt", phone: "Đã xác minh số điện thoại" },
};

export function resolveVerificationBadgesCopy(rawLocale: string): VerificationBadgesCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
