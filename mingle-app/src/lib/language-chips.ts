/**
 * Which language flags a post or a self-introduction shows (owner,
 * 2026-11-25).
 *
 * Up front, at most four: the original, the reader's own language (편한 언어,
 * the first one), their first 관심 언어, and English. A flag that would repeat
 * (the original is English, or the reader's languages are) is simply left
 * out, so the row can be as short as one flag.
 *
 * Behind "+" (more languages): the reader's second and later 편한 언어 and
 * 관심 언어, then only languages a translation is already made in. Any other
 * language is found through the "..." button at the end, which opens the
 * language search screen.
 *
 * A flag does not promise a finished translation: one that is not made yet is
 * drawn faded (`isLanguageReady`) and translated when it is tapped.
 */
export type LanguageChipInput = {
  /** The language the text was written in; null when it was never detected. */
  sourceLanguage: string | null;
  /** A body that mixes languages has a real translation into its own language too. */
  sourceLanguagesMixed?: boolean;
  /** The reader's own languages (편한 언어), the main one first. */
  comfortableLanguages?: ReadonlyArray<string | null | undefined>;
  /** The reader's 관심 언어, most wanted first. */
  interestLanguages?: readonly string[];
  /** Languages a translation already exists in. */
  translatedLanguages?: readonly string[];
  /** Languages the reader picked on the search screen: kept in the row. */
  pickedLanguages?: readonly string[];
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
  const comfortable = (input.comfortableLanguages ?? []).filter((code): code is string => Boolean(code?.trim()));
  const interest = input.interestLanguages ?? [];
  // The reader's own language, one 관심 언어, then English.
  const main = take([comfortable[0], interest[0], "en"], MAIN_LIMIT);
  const more = take([
    ...comfortable.slice(1),
    ...interest.slice(1),
    ...(input.translatedLanguages ?? []),
    ...(input.pickedLanguages ?? []),
  ]);
  return { main, more };
}

/** Whether a translation into `language` is already made (`ready`: the languages that are). */
export function isLanguageReady(language: string, ready: readonly string[]): boolean {
  const id = key(language);
  return ready.some((code) => key(code) === id);
}
