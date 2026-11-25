import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** The button after the language flags of a post or a bio that opens the rest (owner, 2026-11-25). */
const COPY: Record<PrimaryUiLocale, string> = {
  ko: "언어 더보기",
  en: "More languages",
  ja: "他の言語",
  "zh-CN": "更多语言",
  "zh-TW": "更多語言",
  fr: "Plus de langues",
  de: "Weitere Sprachen",
  es: "Más idiomas",
  pt: "Mais idiomas",
  it: "Altre lingue",
  ru: "Другие языки",
  ar: "لغات أخرى",
  hi: "और भाषाएँ",
  th: "ภาษาอื่น ๆ",
  vi: "Ngôn ngữ khác",
};

export function resolveMoreLanguagesCopy(rawLocale: string): string {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
