// Runtime i18n coverage audit shared by `i18n-coverage.test.ts` and the QA
// report script. For every primary UI locale it resolves each copy source
// (the app dictionary, every exported `resolve*Copy` / `get*Copy` resolver and
// every locale-keyed copy table) and flags strings that were not translated:
//
//   missing-locale  a locale-keyed table has no entry for the locale
//   korean-leak     a non-Korean locale shows the Korean string (DEFAULT_LOCALE fallback)
//   english-leak    a non-English locale shows exactly the English string
import { PRIMARY_UI_LOCALES, type PrimaryUiLocale } from "@/i18n/mingle-locales";

export type I18nCoverageFinding = {
  kind: "missing-locale" | "korean-leak" | "english-leak";
  source: string;
  locale: PrimaryUiLocale;
  path: string;
  value: string;
};

const HANGUL = /[ㄱ-힝]/;
const LETTERS = /\p{L}{2,}/u;
// Strings that are legitimately the same in English and other languages.
const SAME_EVERYWHERE = /^(HashChat|Mingle|Mingle Labs|Google|Apple|Kakao|LINE|Facebook|Instagram|TikTok|YouTube|X|Threads|WhatsApp|WeChat|Telegram|Discord|Reddit|OK|AI|PRO|Pro|LIVE|Beta|ID|URL|QR|TTS|STT|SNS|iOS|Android|AirPods|GIF|PNG|JPG|JPEG|WEBP|PDF|CSV|TXT|Email|E-mail|Gmail|App Store|Google Play|Wi-Fi|Bluetooth|HelloTalk|TestFlight|example@email\.com|Soniox|OpenAI|Gemini|Claude|GPT[\w .-]*|v?\d[\w .:-]*|[A-Z]{2,5}(-[A-Z]{2,4})?)$/;

export type CopySource = {
  name: string;
  resolve: (locale: PrimaryUiLocale) => unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function flattenStrings(value: unknown, prefix = "", out = new Map<string, string>(), depth = 0): Map<string, string> {
  if (depth > 6) return out;
  if (typeof value === "string") {
    out.set(prefix || "(value)", value);
  } else if (typeof value === "function") {
    // Formatter copy such as `(count) => \`${count} likes\``: sample it.
    try {
      const sample = (value as (...args: unknown[]) => unknown)(2, "Alex", "Alex");
      if (typeof sample === "string") out.set(`${prefix}()`, sample);
    } catch {
      // Formatters that need structured input are skipped.
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => flattenStrings(item, `${prefix}[${index}]`, out, depth + 1));
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) flattenStrings(child, prefix ? `${prefix}.${key}` : key, out, depth + 1);
  }
  return out;
}

function stripPlaceholders(text: string): string {
  return text.replace(/\{[^}]*\}|\$\{[^}]*\}|%\w|\d+/g, "").trim();
}

export function auditCopySources(sources: CopySource[], locales: readonly PrimaryUiLocale[] = PRIMARY_UI_LOCALES): I18nCoverageFinding[] {
  const findings: I18nCoverageFinding[] = [];
  for (const source of sources) {
    let en: Map<string, string>;
    let ko: Map<string, string>;
    try {
      en = flattenStrings(source.resolve("en"));
      ko = flattenStrings(source.resolve("ko"));
    } catch {
      continue;
    }
    for (const locale of locales) {
      if (locale === "en") continue;
      let strings: Map<string, string>;
      try {
        strings = flattenStrings(source.resolve(locale));
      } catch {
        continue;
      }
      for (const [path, value] of strings) {
        // Option codes and ids are data, not copy.
        if (/(^|\.)(code|id|key|value)$/.test(path)) continue;
        if (locale !== "ko" && HANGUL.test(value) && ko.get(path) === value) {
          findings.push({ kind: "korean-leak", source: source.name, locale, path, value });
          continue;
        }
        const enValue = en.get(path);
        const core = stripPlaceholders(value);
        if (enValue === value && LETTERS.test(core) && !SAME_EVERYWHERE.test(core) && !SAME_EVERYWHERE.test(value.trim())) {
          findings.push({ kind: "english-leak", source: source.name, locale, path, value });
        }
      }
    }
  }
  return findings;
}

const LOCALE_KEY_HINTS = ["ko", "en", "ja"];

/** Copy tables keyed by locale ({ ko: {...}, en: {...}, ja: {...} }). */
export function isLocaleKeyedTable(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return LOCALE_KEY_HINTS.every((key) => key in value) && (isRecord(value.en) || typeof value.en === "string");
}

export function auditLocaleTables(
  tables: Array<{ name: string; table: Record<string, unknown> }>,
  locales: readonly PrimaryUiLocale[] = PRIMARY_UI_LOCALES,
): I18nCoverageFinding[] {
  const findings: I18nCoverageFinding[] = [];
  for (const { name, table } of tables) {
    for (const locale of locales) {
      if (!(locale in table) || table[locale] === undefined) {
        findings.push({ kind: "missing-locale", source: name, locale, path: "", value: "" });
      }
    }
  }
  return findings.concat(auditCopySources(
    tables.map(({ name, table }) => ({ name, resolve: (locale) => table[locale] ?? table.en })),
    locales,
  ));
}
