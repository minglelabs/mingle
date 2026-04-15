import {
  STT_LANGUAGE_OPTIONS,
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
