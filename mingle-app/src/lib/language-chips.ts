import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";

/**
 * Which language flags a post or a self-introduction shows (owner,
 * 2026-11-25). Up front, at most four: the original, the reader's own
 * language (편한 언어), their 관심 언어, and English. A flag that would repeat
 * (the original is English, or the reader's languages are) is simply left
 * out, so the row can be as short as one flag. Every other language sits
 * behind "more languages", which opens a row that scrolls sideways.
 *
 * A flag does not promise a finished translation: en/ko/ja/zh-CN are made in
 * advance, the others when the flag is tapped.
 */
export type LanguageChipInput = {
  /** The language the text was written in; null when it was never detected. */
  sourceLanguage: string | null;
  /** A body that mixes languages has a real translation into its own language too. */
  sourceLanguagesMixed?: boolean;
  /** The reader's own language. */
  comfortableLanguage: string | null;
  /** The reader's 관심 언어, most wanted first. */
  interestLanguages?: readonly string[];
  /** Languages a translation already exists in: listed first under "more". */
  translatedLanguages?: readonly string[];
};

export type LanguageChips = {
  /** Shown beside the original flag: at most three. */
  main: string[];
  /** Behind "more languages". */
  more: string[];
};

const MAIN_LIMIT = 3;
const key = (language: string) => language.trim().toLowerCase();

export function buildLanguageChips(input: LanguageChipInput): LanguageChips {
  const sourceKey = input.sourceLanguagesMixed ? "" : key(input.sourceLanguage ?? "");
  const seen = new Set<string>();
  const take = (languages: ReadonlyArray<string | null | undefined>, limit = Number.POSITIVE_INFINITY) => {
    const out: string[] = [];
    for (const language of languages) {
      if (out.length >= limit) break;
      const code = language?.trim();
      if (!code) continue;
      const id = key(code);
      if (id === sourceKey || seen.has(id)) continue;
      seen.add(id);
      out.push(code);
    }
    return out;
  };
  // The reader's own language, one 관심 언어, then English.
  const main = take([input.comfortableLanguage, input.interestLanguages?.[0], "en"], MAIN_LIMIT);
  const more = take([
    ...(input.interestLanguages ?? []),
    ...(input.translatedLanguages ?? []),
    "ko", "ja", "zh-CN",
    ...PRIMARY_UI_LOCALES,
  ]);
  return { main, more };
}
