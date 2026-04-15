import {
  STT_LANGUAGE_OPTIONS,
  canonicalizeSttLanguageCode,
  type SttLanguageCode,
  type SttLanguageOption,
} from "@/lib/stt-languages";

export type LanguageSelectorSortMode = "locale" | "alphabetical";

export type LanguageSelectorItem = SttLanguageOption & {
  localizedName: string;
  nativeName: string;
  secondaryLabel: string;
  searchText: string;
};

type LanguageSelectorLocaleSource = "ui" | "browser" | "fallback";

const FALLBACK_LOCALE = "en";
export const LANGUAGE_SELECTOR_HISTORY_STATE_KEY = "__mingle_live_phone_demo_lang_selector";
export const LANGUAGE_SELECTOR_RECENT_CODES_LIMIT = 12;
const SELF_NAME_LOCALE_OVERRIDES: Partial<Record<string, string>> = {
  no: "nb-NO",
  zh: "zh-CN",
};

function normalizeSearchText(rawValue: string): string {
  return rawValue
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

function createLanguageDisplayNames(locales: string[]): Intl.DisplayNames | null {
  for (const locale of locales) {
    try {
      return new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      continue;
    }
  }

  return null;
}

function formatLanguageName(
  displayNames: Intl.DisplayNames | null,
  languageCode: string,
  fallbackLabel: string,
): string {
  const formatted = displayNames?.of(languageCode)?.trim();
  return formatted || fallbackLabel;
}

function areLabelsEquivalent(left: string, right: string): boolean {
  return normalizeSearchText(left) === normalizeSearchText(right);
}

function resolveSelfNameLocale(languageCode: string): string {
  return SELF_NAME_LOCALE_OVERRIDES[languageCode] ?? languageCode;
}

function sanitizeLanguageCodes(
  rawCodes: readonly string[],
  limit: number,
): SttLanguageCode[] {
  const deduped: SttLanguageCode[] = [];
  for (const rawCode of rawCodes) {
    const normalizedCode = canonicalizeSttLanguageCode(rawCode);
    if (!normalizedCode || deduped.includes(normalizedCode)) continue;
    deduped.push(normalizedCode);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

export function resolveLanguageSelectorLocale(
  uiLocale?: string,
): { locale: string; source: LanguageSelectorLocaleSource } {
  const normalizedUiLocale = uiLocale?.trim();
  if (normalizedUiLocale) {
    return { locale: normalizedUiLocale, source: "ui" };
  }

  if (typeof window !== "undefined") {
    const browserLocale = (
      document.documentElement.lang ||
      window.navigator.languages?.find(Boolean) ||
      window.navigator.language ||
      ""
    ).trim();

    if (browserLocale) {
      return { locale: browserLocale, source: "browser" };
    }
  }

  return { locale: FALLBACK_LOCALE, source: "fallback" };
}

export function resolveDefaultLanguageSelectorSortMode(
  source: LanguageSelectorLocaleSource,
): LanguageSelectorSortMode {
  return source === "fallback" ? "alphabetical" : "locale";
}

export function buildLanguageSelectorItems(
  userLocale: string,
  options: readonly SttLanguageOption[] = STT_LANGUAGE_OPTIONS,
): LanguageSelectorItem[] {
  const localizedDisplayNames = createLanguageDisplayNames([userLocale, FALLBACK_LOCALE]);

  return options.map((language) => {
    const nativeDisplayNames = createLanguageDisplayNames([
      resolveSelfNameLocale(language.code),
      language.code,
      FALLBACK_LOCALE,
    ]);
    const localizedName = formatLanguageName(
      localizedDisplayNames,
      language.code,
      language.englishName,
    );
    const nativeName = formatLanguageName(
      nativeDisplayNames,
      language.code,
      language.englishName,
    );
    const secondaryParts = [language.englishName];
    if (!areLabelsEquivalent(nativeName, language.englishName)) {
      secondaryParts.push(nativeName);
    }

    return {
      ...language,
      localizedName,
      nativeName,
      secondaryLabel: secondaryParts.join(" / "),
      searchText: normalizeSearchText(
        [
          language.code,
          language.englishName,
          localizedName,
          nativeName,
          secondaryParts.join(" "),
        ].join(" "),
      ),
    };
  });
}

export function filterLanguageSelectorItems(
  items: readonly LanguageSelectorItem[],
  query: string,
): LanguageSelectorItem[] {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) return [...items];

  return items.filter((item) => item.searchText.includes(normalizedQuery));
}

export function sortLanguageSelectorItems(
  items: readonly LanguageSelectorItem[],
  sortMode: LanguageSelectorSortMode,
  userLocale: string,
): LanguageSelectorItem[] {
  const sorted = [...items];
  sorted.sort((left, right) => {
    const primaryComparison = (
      sortMode === "alphabetical"
        ? left.englishName.localeCompare(right.englishName, FALLBACK_LOCALE, {
            sensitivity: "base",
          })
        : left.localizedName.localeCompare(right.localizedName, userLocale, {
            sensitivity: "base",
          })
    );

    if (primaryComparison !== 0) return primaryComparison;

    return left.englishName.localeCompare(right.englishName, FALLBACK_LOCALE, {
      sensitivity: "base",
    });
  });

  return sorted;
}

export function isLanguageSelectorHistoryOpen(state: unknown): boolean {
  return Boolean(
    state
    && typeof state === "object"
    && (state as Record<string, unknown>)[LANGUAGE_SELECTOR_HISTORY_STATE_KEY] === true,
  );
}

export function buildLanguageSelectorHistoryState(
  currentState: unknown,
): Record<string, unknown> {
  const nextState = (
    currentState && typeof currentState === "object"
      ? { ...(currentState as Record<string, unknown>) }
      : {}
  );
  nextState[LANGUAGE_SELECTOR_HISTORY_STATE_KEY] = true;
  return nextState;
}

export function clearLanguageSelectorHistoryState(
  currentState: unknown,
): Record<string, unknown> {
  const nextState = (
    currentState && typeof currentState === "object"
      ? { ...(currentState as Record<string, unknown>) }
      : {}
  );
  delete nextState[LANGUAGE_SELECTOR_HISTORY_STATE_KEY];
  return nextState;
}

export function sanitizeRecentLanguageCodes(
  rawValue: unknown,
  limit = LANGUAGE_SELECTOR_RECENT_CODES_LIMIT,
): SttLanguageCode[] {
  if (!Array.isArray(rawValue)) return [];
  return sanitizeLanguageCodes(rawValue, limit);
}

export function hydrateRecentLanguageCodes(
  selectedLanguages: readonly string[],
  recentCodes: readonly string[],
  limit = LANGUAGE_SELECTOR_RECENT_CODES_LIMIT,
): SttLanguageCode[] {
  const nextRecentCodes = sanitizeLanguageCodes(recentCodes, limit);
  const selectedCodes = sanitizeLanguageCodes([...selectedLanguages].reverse(), limit);

  for (const selectedCode of [...selectedCodes].reverse()) {
    if (nextRecentCodes.includes(selectedCode)) continue;
    nextRecentCodes.unshift(selectedCode);
    if (nextRecentCodes.length > limit) {
      nextRecentCodes.pop();
    }
  }

  return nextRecentCodes;
}

export function bumpRecentLanguageCode(
  rawCode: string,
  recentCodes: readonly string[],
  limit = LANGUAGE_SELECTOR_RECENT_CODES_LIMIT,
): SttLanguageCode[] {
  const normalizedCode = canonicalizeSttLanguageCode(rawCode);
  if (!normalizedCode) {
    return sanitizeLanguageCodes(recentCodes, limit);
  }

  return [
    normalizedCode,
    ...sanitizeLanguageCodes(recentCodes, limit).filter((code) => code !== normalizedCode),
  ].slice(0, limit);
}
