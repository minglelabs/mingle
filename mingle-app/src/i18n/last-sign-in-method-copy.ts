import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Badge on the sign-in button this device last signed in with. */
const LAST_USED_COPY_BY_LOCALE: Record<PrimaryUiLocale, string> = {
  ko: "최근 사용",
  en: "Last used",
  ja: "前回使用",
  "zh-CN": "上次使用",
  "zh-TW": "上次使用",
  fr: "Dernière utilisée",
  de: "Zuletzt genutzt",
  es: "Último usado",
  pt: "Último usado",
  it: "Ultimo usato",
  ru: "Последний вход",
  ar: "آخر استخدام",
  hi: "पिछली बार",
  th: "ใช้ล่าสุด",
  vi: "Dùng gần đây",
};

export function resolveLastUsedSignInCopy(rawLocale: string): string {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return LAST_USED_COPY_BY_LOCALE[locale] ?? LAST_USED_COPY_BY_LOCALE.en;
}
