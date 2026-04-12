export const PRIMARY_UI_LOCALES = [
  "ko",
  "en",
  "ja",
  "zh-CN",
  "zh-TW",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ru",
  "ar",
  "hi",
  "th",
  "vi",
] as const;

export type PrimaryUiLocale = (typeof PRIMARY_UI_LOCALES)[number];

export const APP_SUPPORTED_LOCALES = [
  "ko",
  "en",
  "ja",
  "zh-CN",
  "zh-TW",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ru",
  "ar",
  "af",
  "sq",
  "az",
  "eu",
  "be",
  "bn",
  "bs",
  "bg",
  "ca",
  "hr",
  "cs",
  "da",
  "nl",
  "et",
  "fi",
  "gl",
  "el",
  "gu",
  "he",
  "hi",
  "hu",
  "id",
  "kn",
  "kk",
  "th",
  "lv",
  "lt",
  "mk",
  "ms",
  "ml",
  "mr",
  "no",
  "fa",
  "pl",
  "pa",
  "ro",
  "sr",
  "sk",
  "sl",
  "sw",
  "sv",
  "tl",
  "ta",
  "te",
  "tr",
  "uk",
  "ur",
  "vi",
  "cy",
] as const;

export type AppSupportedLocale = (typeof APP_SUPPORTED_LOCALES)[number];

export const DEFAULT_MINGLE_LOCALE: AppSupportedLocale = "ko";

export const PRIMARY_UI_LANGUAGE_OPTIONS: ReadonlyArray<{
  code: PrimaryUiLocale;
  name: string;
  flag: string;
}> = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "ko", name: "한국어", flag: "🇰🇷" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "zh-CN", name: "简体中文", flag: "🇨🇳" },
  { code: "zh-TW", name: "繁體中文", flag: "🇹🇼" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳" },
  { code: "th", name: "ไทย", flag: "🇹🇭" },
  { code: "vi", name: "Tiếng Việt", flag: "🇻🇳" },
];

const PRIMARY_UI_LOCALE_SET = new Set<PrimaryUiLocale>(PRIMARY_UI_LOCALES);
const APP_SUPPORTED_LOCALE_SET = new Set<AppSupportedLocale>(APP_SUPPORTED_LOCALES);

const LOCALE_ALIAS_MAP: Record<string, AppSupportedLocale> = {
  ko: "ko",
  en: "en",
  ja: "ja",
  fr: "fr",
  de: "de",
  es: "es",
  pt: "pt",
  it: "it",
  ru: "ru",
  ar: "ar",
  af: "af",
  sq: "sq",
  az: "az",
  eu: "eu",
  be: "be",
  bn: "bn",
  bs: "bs",
  bg: "bg",
  ca: "ca",
  hr: "hr",
  cs: "cs",
  da: "da",
  nl: "nl",
  et: "et",
  fi: "fi",
  gl: "gl",
  el: "el",
  gu: "gu",
  he: "he",
  hi: "hi",
  hu: "hu",
  id: "id",
  kn: "kn",
  kk: "kk",
  th: "th",
  lv: "lv",
  lt: "lt",
  mk: "mk",
  ms: "ms",
  ml: "ml",
  mr: "mr",
  no: "no",
  fa: "fa",
  pl: "pl",
  pa: "pa",
  ro: "ro",
  sr: "sr",
  sk: "sk",
  sl: "sl",
  sw: "sw",
  sv: "sv",
  tl: "tl",
  ta: "ta",
  te: "te",
  tr: "tr",
  uk: "uk",
  ur: "ur",
  vi: "vi",
  cy: "cy",
  fil: "tl",
  in: "id",
  iw: "he",
  nb: "no",
  nn: "no",
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-sg": "zh-CN",
  "zh-tw": "zh-TW",
  "zh-hant": "zh-TW",
  "zh-hk": "zh-TW",
  "zh-mo": "zh-TW",
};

const PRIMARY_UI_LOCALE_FALLBACK_MAP: Record<AppSupportedLocale, PrimaryUiLocale> = {
  ko: "ko",
  en: "en",
  ja: "ja",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  fr: "fr",
  de: "de",
  es: "es",
  pt: "pt",
  it: "it",
  ru: "ru",
  ar: "ar",
  af: "en",
  sq: "en",
  az: "en",
  eu: "en",
  be: "en",
  bn: "en",
  bs: "en",
  bg: "en",
  ca: "en",
  hr: "en",
  cs: "en",
  da: "en",
  nl: "en",
  et: "en",
  fi: "en",
  gl: "en",
  el: "en",
  gu: "en",
  he: "en",
  hi: "hi",
  hu: "en",
  id: "en",
  kn: "en",
  kk: "en",
  th: "th",
  lv: "en",
  lt: "en",
  mk: "en",
  ms: "en",
  ml: "en",
  mr: "en",
  no: "en",
  fa: "en",
  pl: "en",
  pa: "en",
  ro: "en",
  sr: "en",
  sk: "en",
  sl: "en",
  sw: "en",
  sv: "en",
  tl: "en",
  ta: "en",
  te: "en",
  tr: "en",
  uk: "en",
  ur: "en",
  vi: "vi",
  cy: "en",
};

function resolveZhLocale(normalized: string): AppSupportedLocale | null {
  if (normalized === "zh" || normalized.startsWith("zh-")) {
    if (
      normalized.includes("-tw")
      || normalized.includes("-hant")
      || normalized.includes("-hk")
      || normalized.includes("-mo")
    ) {
      return "zh-TW";
    }
    return "zh-CN";
  }
  return null;
}

export function normalizeLocaleTag(rawValue: string): string {
  return rawValue.trim().replace(/_/g, "-").toLowerCase();
}

export function isPrimaryUiLocale(value: string): value is PrimaryUiLocale {
  return PRIMARY_UI_LOCALE_SET.has(value as PrimaryUiLocale);
}

export function isAppSupportedLocale(value: string): value is AppSupportedLocale {
  return APP_SUPPORTED_LOCALE_SET.has(value as AppSupportedLocale);
}

export function resolveAppSupportedLocaleTag(rawValue: string): AppSupportedLocale | null {
  const normalized = normalizeLocaleTag(rawValue);
  if (!normalized) return null;

  const directMatch = LOCALE_ALIAS_MAP[normalized];
  if (directMatch) {
    return directMatch;
  }

  const zhResolved = resolveZhLocale(normalized);
  if (zhResolved) {
    return zhResolved;
  }

  const base = normalized.split("-")[0];
  if (!base) return null;

  return LOCALE_ALIAS_MAP[base] ?? null;
}

export function resolvePrimaryUiLocale(locale: AppSupportedLocale): PrimaryUiLocale {
  return PRIMARY_UI_LOCALE_FALLBACK_MAP[locale];
}

export function resolvePrimaryUiLocaleTag(rawValue: string): PrimaryUiLocale | null {
  const locale = resolveAppSupportedLocaleTag(rawValue);
  return locale ? resolvePrimaryUiLocale(locale) : null;
}
