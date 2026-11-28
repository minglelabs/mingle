import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * The buttons after the language flags of a post or a bio (owner, 2026-11-25):
 * `more` opens the flags kept behind "+", `search` opens the language search
 * screen (also its title).
 */
export type MoreLanguagesCopy = { more: string; search: string };

const COPY: Record<PrimaryUiLocale, MoreLanguagesCopy> = {
  ko: { more: "언어 더보기", search: "언어 찾기" },
  en: { more: "More languages", search: "Find a language" },
  ja: { more: "他の言語", search: "言語を探す" },
  "zh-CN": { more: "更多语言", search: "查找语言" },
  "zh-TW": { more: "更多語言", search: "尋找語言" },
  fr: { more: "Plus de langues", search: "Trouver une langue" },
  de: { more: "Weitere Sprachen", search: "Sprache suchen" },
  es: { more: "Más idiomas", search: "Buscar un idioma" },
  pt: { more: "Mais idiomas", search: "Buscar um idioma" },
  it: { more: "Altre lingue", search: "Trova una lingua" },
  ru: { more: "Другие языки", search: "Найти язык" },
  ar: { more: "لغات أخرى", search: "ابحث عن لغة" },
  hi: { more: "और भाषाएँ", search: "भाषा खोजें" },
  th: { more: "ภาษาอื่น ๆ", search: "ค้นหาภาษา" },
  vi: { more: "Ngôn ngữ khác", search: "Tìm ngôn ngữ" },
};

function resolve(rawLocale: string): MoreLanguagesCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}

export function resolveMoreLanguagesCopy(rawLocale: string): string {
  return resolve(rawLocale).more;
}

export function resolveLanguageSearchCopy(rawLocale: string): string {
  return resolve(rawLocale).search;
}
