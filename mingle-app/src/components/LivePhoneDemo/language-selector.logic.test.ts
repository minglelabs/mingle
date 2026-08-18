import { describe, expect, it } from "vitest";

import {
  buildLanguageSelectorHistoryState,
  buildLanguageSelectorButtonCodes,
  buildLanguageSelectorFeaturedItems,
  buildRecentLanguageChipCodes,
  buildLanguageSelectorItems,
  clearLanguageSelectorHistoryState,
  filterLanguageSelectorItems,
  isLanguageSelectorHistoryOpen,
  LANGUAGE_SELECTOR_PRIORITY_CODES,
  partitionLanguageSelectorItemsByPriority,
  registerDeselectedLanguageCode,
  resolveDefaultLanguageSelectorSortMode,
  resolveLanguageSelectorShowsSortToggle,
  sanitizeRecentLanguageCodes,
  syncDeselectedLanguageCodes,
  sortLanguageSelectorItems,
  type LanguageSelectorItem,
} from "@/components/LivePhoneDemo/language-selector.logic";

describe("language-selector.logic", () => {
  it("builds localized rows with English and native names", () => {
    const japanese = buildLanguageSelectorItems("ko-KR").find(
      (item) => item.code === "ja",
    );

    expect(japanese).toBeDefined();
    expect(japanese?.localizedName).toBe("일본어");
    expect(japanese?.secondaryLabel).toContain("Japanese");
    expect(japanese?.secondaryLabel).toContain("日本語");
  });

  it("shows separate Simplified and Traditional Chinese rows", () => {
    const items = buildLanguageSelectorItems("en-US");

    expect(items.find((item) => item.code === "zh-CN")?.secondaryLabel)
      .toContain("Chinese Simplified");
    expect(items.find((item) => item.code === "zh-TW")?.secondaryLabel)
      .toContain("Chinese Traditional");
    expect(items.some((item) => (item.code as string) === "zh")).toBe(false);
  });

  it("filters by English and native language names", () => {
    const items = buildLanguageSelectorItems("en-US");

    expect(filterLanguageSelectorItems(items, "japanese").map((item) => item.code)).toContain("ja");
    expect(filterLanguageSelectorItems(items, "日本語").map((item) => item.code)).toContain("ja");
  });

  it("sorts alphabetically by English name", () => {
    const items: LanguageSelectorItem[] = [
      {
        code: "ja",
        flag: "🇯🇵",
        englishName: "Japanese",
        localizedName: "일본어",
        nativeName: "日本語",
        secondaryLabel: "Japanese / 日本語",
        searchText: "japanese nihongo",
      },
      {
        code: "de",
        flag: "🇩🇪",
        englishName: "German",
        localizedName: "독일어",
        nativeName: "Deutsch",
        secondaryLabel: "German / Deutsch",
        searchText: "german deutsch",
      },
      {
        code: "ko",
        flag: "🇰🇷",
        englishName: "Korean",
        localizedName: "한국어",
        nativeName: "한국어",
        secondaryLabel: "Korean / 한국어",
        searchText: "korean hanguk-eo",
      },
    ];

    expect(
      sortLanguageSelectorItems(items, "alphabetical", "ko-KR").map((item) => item.code),
    ).toEqual(["de", "ja", "ko"]);
  });

  it("sorts by the user locale when requested", () => {
    const items: LanguageSelectorItem[] = [
      {
        code: "ja",
        flag: "🇯🇵",
        englishName: "Zulu",
        localizedName: "나",
        nativeName: "日本語",
        secondaryLabel: "Zulu / 日本語",
        searchText: "zulu nihongo",
      },
      {
        code: "de",
        flag: "🇩🇪",
        englishName: "Alpha",
        localizedName: "다",
        nativeName: "Deutsch",
        secondaryLabel: "Alpha / Deutsch",
        searchText: "alpha deutsch",
      },
      {
        code: "ko",
        flag: "🇰🇷",
        englishName: "Mike",
        localizedName: "가",
        nativeName: "한국어",
        secondaryLabel: "Mike / 한국어",
        searchText: "mike hanguk-eo",
      },
    ];

    expect(
      sortLanguageSelectorItems(items, "locale", "ko-KR").map((item) => item.code),
    ).toEqual(["ko", "ja", "de"]);
  });

  it("keeps featured profile languages in the requested fixed order", () => {
    const items = buildLanguageSelectorItems("ko-KR");

    expect(buildLanguageSelectorFeaturedItems(items).map((item) => item.code)).toEqual([
      "en",
      "es",
      "ko",
      "ja",
      "zh-CN",
      "fr",
      "pt",
    ]);
  });

  it("defaults to alphabetical sorting only when locale data is missing", () => {
    expect(resolveDefaultLanguageSelectorSortMode("fallback")).toBe("alphabetical");
    expect(resolveDefaultLanguageSelectorSortMode("ui")).toBe("locale");
    expect(resolveDefaultLanguageSelectorSortMode("browser")).toBe("locale");
  });

  it("decides sort-toggle visibility from locale metadata instead of translated labels", () => {
    expect(resolveLanguageSelectorShowsSortToggle("ko-KR")).toBe(true);
    expect(resolveLanguageSelectorShowsSortToggle("zh-CN")).toBe(true);
    expect(resolveLanguageSelectorShowsSortToggle("fr-FR")).toBe(false);
    expect(resolveLanguageSelectorShowsSortToggle("vi-VN")).toBe(false);
  });

  it("marks and clears the language selector history state without dropping other keys", () => {
    const state = buildLanguageSelectorHistoryState({ keep: 1 });

    expect(isLanguageSelectorHistoryOpen(state)).toBe(true);
    expect(state.keep).toBe(1);

    const clearedState = clearLanguageSelectorHistoryState(state);
    expect(isLanguageSelectorHistoryOpen(clearedState)).toBe(false);
    expect(clearedState.keep).toBe(1);
  });

  it("sanitizes deselected language history", () => {
    expect(
      sanitizeRecentLanguageCodes(["en", "ko", "bogus", "ko", "ja"]),
    ).toEqual(["en", "ko", "ja"]);
  });

  it("keeps selected chips first and deselected chips after them", () => {
    expect(
      buildRecentLanguageChipCodes(["en", "ja"], ["ko", "en", "fr"]),
    ).toEqual(["en", "ja", "ko", "fr"]);
  });

  it("drops active languages from deselected history", () => {
    expect(
      syncDeselectedLanguageCodes(["en", "ja"], ["ko", "en", "fr", "ja"]),
    ).toEqual(["ko", "fr"]);
  });

  it("keeps the most recently deselected languages first", () => {
    expect(
      registerDeselectedLanguageCode("ja", ["ko", "en", "ja"]),
    ).toEqual(["ja", "ko", "en"]);
  });

  it("builds the header button language flags from speech first, then translation", () => {
    expect(
      buildLanguageSelectorButtonCodes(["en", "ko", "zh-CN"], ["en", "ja"]),
    ).toEqual(["en", "ko", "zh-CN", "ja"]);
  });

  it("limits the header button language flags to five codes", () => {
    expect(
      buildLanguageSelectorButtonCodes(["en", "ko", "zh-CN", "ja"], ["fr", "de", "es"]),
    ).toEqual(["en", "ko", "zh-CN", "ja", "fr"]);
  });

  describe("partitionLanguageSelectorItemsByPriority", () => {
    it("pulls priority-language codes into their own bucket, in a fixed priority order", () => {
      const items: LanguageSelectorItem[] = [
        {
          code: "gl",
          flag: "🇪🇸",
          englishName: "Galician",
          localizedName: "Galician",
          nativeName: "Galego",
          secondaryLabel: "Galician / Galego",
          searchText: "galician galego",
        },
        {
          code: "ja",
          flag: "🇯🇵",
          englishName: "Japanese",
          localizedName: "Japanese",
          nativeName: "日本語",
          secondaryLabel: "Japanese / 日本語",
          searchText: "japanese nihongo",
        },
        {
          code: "en",
          flag: "🇺🇸",
          englishName: "English",
          localizedName: "English",
          nativeName: "English",
          secondaryLabel: "English",
          searchText: "english",
        },
      ];

      const { priorityItems, otherItems } = partitionLanguageSelectorItemsByPriority(items);

      // "en" ranks before "ja" in LANGUAGE_SELECTOR_PRIORITY_CODES, so priority
      // order wins even though the input order (and any alphabetical sort) would
      // put "ja" first -- this is the fix for a low-traffic language like Galician
      // outranking major languages at the top of the picker.
      expect(priorityItems.map((item) => item.code)).toEqual(["en", "ja"]);
      expect(otherItems.map((item) => item.code)).toEqual(["gl"]);
    });

    it("leaves the incoming order of non-priority items untouched", () => {
      const items: LanguageSelectorItem[] = [
        {
          code: "bg",
          flag: "🇧🇬",
          englishName: "Bulgarian",
          localizedName: "Bulgarian",
          nativeName: "Български",
          secondaryLabel: "Bulgarian / Български",
          searchText: "bulgarian",
        },
        {
          code: "gl",
          flag: "🇪🇸",
          englishName: "Galician",
          localizedName: "Galician",
          nativeName: "Galego",
          secondaryLabel: "Galician / Galego",
          searchText: "galician",
        },
      ];
      expect(items.some((item) => (LANGUAGE_SELECTOR_PRIORITY_CODES as readonly string[]).includes(item.code)))
        .toBe(false);

      const { otherItems } = partitionLanguageSelectorItemsByPriority(items);

      expect(otherItems.map((item) => item.code)).toEqual(["bg", "gl"]);
    });

    it("returns an empty priority bucket when nothing in the list is a priority language", () => {
      const items: LanguageSelectorItem[] = [
        {
          code: "gl",
          flag: "🇪🇸",
          englishName: "Galician",
          localizedName: "Galician",
          nativeName: "Galego",
          secondaryLabel: "Galician / Galego",
          searchText: "galician",
        },
      ];

      const { priorityItems, otherItems } = partitionLanguageSelectorItemsByPriority(items);

      expect(priorityItems).toEqual([]);
      expect(otherItems.map((item) => item.code)).toEqual(["gl"]);
    });
  });
});
