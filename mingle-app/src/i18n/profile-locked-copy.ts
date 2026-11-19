import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Under gender and birth date in profile edit once they are set: they cannot change. */
const COPY: Record<PrimaryUiLocale, string> = {
  ko: "성별과 생년월일은 한 번 정하면 바꿀 수 없어요.",
  en: "Gender and birth date can't be changed once set.",
  ja: "性別と生年月日は一度決めると変更できません。",
  "zh-CN": "性别和出生日期设置后无法更改。",
  "zh-TW": "性別和出生日期設定後無法更改。",
  fr: "Le genre et la date de naissance ne peuvent plus être modifiés une fois définis.",
  de: "Geschlecht und Geburtsdatum lassen sich nach dem Festlegen nicht mehr ändern.",
  es: "El género y la fecha de nacimiento no se pueden cambiar una vez fijados.",
  pt: "Gênero e data de nascimento não podem ser alterados depois de definidos.",
  it: "Genere e data di nascita non si possono più cambiare una volta impostati.",
  ru: "Пол и дату рождения нельзя изменить после того, как они указаны.",
  ar: "لا يمكن تغيير الجنس وتاريخ الميلاد بعد تحديدهما.",
  hi: "लिंग और जन्मतिथि एक बार तय करने के बाद बदली नहीं जा सकती।",
  th: "เพศและวันเกิดเปลี่ยนไม่ได้หลังจากตั้งค่าแล้ว",
  vi: "Giới tính và ngày sinh không thể thay đổi sau khi đã đặt.",
};

export const PROFILE_LOCKED_COPY_LOCALES = Object.keys(COPY);

export function resolveProfileLockedNote(rawLocale: string): string {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
