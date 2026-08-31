import {
  DEFAULT_LOCALE as APP_DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from "@/i18n/config";
import {
  MAX_STT_LANGUAGE_SELECTION,
  STT_LANGUAGE_OPTIONS,
  canonicalizeSttLanguageCode,
  type SttLanguageCode,
  type SttLanguageOption,
} from "@/lib/stt-languages";

export type LanguageSelectorSortMode = "locale" | "alphabetical";

export type LanguageSelectorSectionCopy = {
  featured: string;
  all: string;
};

export type LanguageSelectorItem = SttLanguageOption & {
  localizedName: string;
  nativeName: string;
  secondaryLabel: string;
  searchText: string;
};

export const LANGUAGE_SELECTOR_FEATURED_CODES = [
  "en",
  "es",
  "ko",
  "ja",
  "zh-CN",
  "fr",
  "pt",
] as const satisfies readonly SttLanguageCode[];

export function resolveLanguageSelectorSectionCopy(rawLocale?: string): LanguageSelectorSectionCopy {
  const normalizedLocale = rawLocale?.trim().toLowerCase() ?? "";
  const isKorean = normalizedLocale === "ko" || normalizedLocale.startsWith("ko-");
  return isKorean
    ? { featured: "주요 언어", all: "전체 언어" }
    : { featured: "Popular languages", all: "All languages" };
}

type LanguageSelectorLocaleSource = "ui" | "browser" | "fallback";

const FALLBACK_LOCALE = "en";
export const LANGUAGE_SELECTOR_HISTORY_STATE_KEY = "__mingle_live_phone_demo_lang_selector";
export const LANGUAGE_SELECTOR_RECENT_CODES_LIMIT = 12;
const LANGUAGE_SELECTOR_HIDE_SORT_TOGGLE_LOCALES = new Set<LegalDocumentLocale>([
  "en",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "vi",
]);
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

export function resolveLanguageSelectorOwnSelectedLanguages(
  roomSelectedLanguages: readonly string[],
  viewerSelectedLanguages?: readonly string[],
  limit = MAX_STT_LANGUAGE_SELECTION,
): SttLanguageCode[] {
  return sanitizeLanguageCodes(
    viewerSelectedLanguages ?? roomSelectedLanguages,
    limit,
  );
}

// Optimistically recomputes the room's displayed language union after the
// caller's OWN picks change, without waiting for the server's recomputed
// union: adding a code always adds it to the union; removing one only drops
// it if no OTHER member's prior attribution still holds it. Leaving a
// just-removed code in the union until the server responds is what makes it
// flash as "someone else picked this" for an instant, even when nobody else
// actually did — see handleToggleSelectedLanguage / handleConversationSelectedLanguagesChange.
export function resolveLanguageSelectorUnionAfterOwnLanguagesChange(args: {
  previousUnion: readonly string[];
  previousAttribution?: Record<string, readonly string[]>;
  viewerUserId?: string | null;
  previousOwnSelectedLanguages: readonly string[];
  nextOwnSelectedLanguages: readonly string[];
}): string[] {
  const removedCodes = args.previousOwnSelectedLanguages.filter(
    (code) => !args.nextOwnSelectedLanguages.includes(code),
  );
  const addedCodes = args.nextOwnSelectedLanguages.filter(
    (code) => !args.previousOwnSelectedLanguages.includes(code),
  );
  const nextUnion = new Set(args.previousUnion);
  addedCodes.forEach((code) => nextUnion.add(code));
  removedCodes.forEach((code) => {
    // If the server did not include member attribution, keep the union
    // conservative until the next canonical response. Dropping an unknown
    // member's code locally would make a shared room flicker or hide a
    // language that another participant still owns.
    if (args.previousAttribution === undefined) return;
    const holders = args.previousAttribution[code];
    if (!holders || holders.length === 0) return;
    const otherHolders = holders
      .filter((memberId) => memberId !== args.viewerUserId);
    if (otherHolders.length === 0) {
      nextUnion.delete(code);
    }
  });
  return [...nextUnion];
}

export function shouldDisableLanguageSelectorOption(args: {
  disabled?: boolean;
  isOwnSelected: boolean;
  ownSelectedCount: number;
  minLanguages?: number;
  maxLanguages?: number;
}): boolean {
  if (args.disabled) return true;

  const minLanguages = args.minLanguages ?? 1;
  const maxLanguages = args.maxLanguages ?? MAX_STT_LANGUAGE_SELECTION;
  return args.isOwnSelected
    ? args.ownSelectedCount <= minLanguages
    : args.ownSelectedCount >= maxLanguages;
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

export function resolveLanguageSelectorShowsSortToggle(rawLocale: string): boolean {
  const supportedLocale = resolveSupportedLocaleTag(rawLocale) ?? APP_DEFAULT_LOCALE;
  const legalLocale = resolveLegalDocumentLocale(supportedLocale);
  return !LANGUAGE_SELECTOR_HIDE_SORT_TOGGLE_LOCALES.has(legalLocale);
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

/** Languages shown ahead of the alphabetical/locale-sorted rest of the picker --
 * without this, a locale-collation quirk (e.g. Galician sorting before "가"/"a")
 * can put a low-traffic language at the very top of the list, ahead of languages
 * with far more speakers. Order here IS the display order within this bucket. */
export const LANGUAGE_SELECTOR_PRIORITY_CODES: readonly SttLanguageCode[] = [
  "en", "ko", "ja", "zh-CN", "zh-TW", "es", "fr", "de", "pt", "it", "ru", "ar", "hi", "th", "vi",
];

export function partitionLanguageSelectorItemsByPriority<T extends { code: string }>(
  items: readonly T[],
): { priorityItems: T[]; otherItems: T[] } {
  const priorityRank = new Map<string, number>(
    LANGUAGE_SELECTOR_PRIORITY_CODES.map((code, index) => [code, index]),
  );

  const priorityItems: T[] = [];
  const otherItems: T[] = [];
  for (const item of items) {
    if (priorityRank.has(item.code)) priorityItems.push(item);
    else otherItems.push(item);
  }
  priorityItems.sort((left, right) => priorityRank.get(left.code)! - priorityRank.get(right.code)!);

  return { priorityItems, otherItems };
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

export function buildLanguageSelectorFeaturedItems(
  items: readonly LanguageSelectorItem[],
): LanguageSelectorItem[] {
  const itemsByCode = new Map(items.map((item) => [item.code, item]));
  return LANGUAGE_SELECTOR_FEATURED_CODES
    .map((code) => itemsByCode.get(code))
    .filter((item): item is LanguageSelectorItem => Boolean(item));
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

export function syncDeselectedLanguageCodes(
  selectedLanguages: readonly string[],
  deselectedCodes: readonly string[],
  limit = LANGUAGE_SELECTOR_RECENT_CODES_LIMIT,
): SttLanguageCode[] {
  const selectedCodeSet = new Set(sanitizeLanguageCodes(selectedLanguages, limit));
  return sanitizeLanguageCodes(deselectedCodes, limit).filter(
    (code) => !selectedCodeSet.has(code),
  );
}

export function registerDeselectedLanguageCode(
  rawCode: string,
  deselectedCodes: readonly string[],
  limit = LANGUAGE_SELECTOR_RECENT_CODES_LIMIT,
): SttLanguageCode[] {
  const normalizedCode = canonicalizeSttLanguageCode(rawCode);
  if (!normalizedCode) {
    return sanitizeLanguageCodes(deselectedCodes, limit);
  }

  return [
    normalizedCode,
    ...sanitizeLanguageCodes(deselectedCodes, limit).filter((code) => code !== normalizedCode),
  ].slice(0, limit);
}

export function buildRecentLanguageChipCodes(
  selectedLanguages: readonly string[],
  deselectedCodes: readonly string[],
  limit = LANGUAGE_SELECTOR_RECENT_CODES_LIMIT,
): SttLanguageCode[] {
  const selectedCodes = sanitizeLanguageCodes(selectedLanguages, limit);
  const selectedCodeSet = new Set(selectedCodes);
  const inactiveCodes = sanitizeLanguageCodes(deselectedCodes, limit).filter(
    (code) => !selectedCodeSet.has(code),
  );

  return [...selectedCodes, ...inactiveCodes].slice(0, limit);
}

export function buildLanguageSelectorButtonCodes(
  speechLanguages: readonly string[],
  translationLanguages: readonly string[],
  limit = 5,
): SttLanguageCode[] {
  return sanitizeLanguageCodes([...speechLanguages, ...translationLanguages], limit);
}
