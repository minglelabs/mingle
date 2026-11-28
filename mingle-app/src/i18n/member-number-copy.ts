import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** "HashChat member #N" under the name on profiles (see @/server/member-number). `{n}` is the number. */
const COPY: Record<PrimaryUiLocale, string> = {
  ko: "해시챗 {n}번째 가입자",
  en: "HashChat member #{n}",
  ja: "HashChat {n}人目のメンバー",
  "zh-CN": "HashChat 第 {n} 位成员",
  "zh-TW": "HashChat 第 {n} 位成員",
  fr: "Membre HashChat n° {n}",
  de: "HashChat-Mitglied Nr. {n}",
  es: "Miembro n.º {n} de HashChat",
  pt: "Membro nº {n} do HashChat",
  it: "Membro n. {n} di HashChat",
  ru: "Участник HashChat №{n}",
  ar: "العضو رقم {n} في HashChat",
  hi: "HashChat सदस्य #{n}",
  th: "สมาชิก HashChat คนที่ {n}",
  vi: "Thành viên thứ {n} của HashChat",
};

export const MEMBER_NUMBER_COPY_LOCALES = Object.keys(COPY);

export function formatMemberNumber(rawLocale: string, memberNumber: number): string {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  let number: string;
  try {
    number = new Intl.NumberFormat(locale === "ar" || locale === "hi" ? "en" : locale).format(memberNumber);
  } catch {
    number = String(memberNumber);
  }
  return (COPY[locale] ?? COPY.en).replace("{n}", number);
}
