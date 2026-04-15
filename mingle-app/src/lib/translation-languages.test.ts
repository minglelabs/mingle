import { describe, expect, it } from "vitest";
import {
  TRANSLATION_LANGUAGES,
  canonicalizeTranslationLanguageCode,
  getTranslationLanguageName,
} from "@/lib/translation-languages";

describe("translation languages", () => {
  it("exposes the full catalog including Chinese script variants", () => {
    expect(TRANSLATION_LANGUAGES).toHaveLength(62);
    expect(TRANSLATION_LANGUAGES).toEqual(expect.arrayContaining([
      { code: "af", englishName: "Afrikaans" },
      { code: "zh", englishName: "Chinese", selectable: false },
      { code: "zh-CN", englishName: "Chinese Simplified" },
      { code: "zh-TW", englishName: "Chinese Traditional" },
      { code: "he", englishName: "Hebrew" },
      { code: "tl", englishName: "Tagalog" },
      { code: "cy", englishName: "Welsh" },
    ]));
  });

  it("canonicalizes known aliases used by clients and model responses", () => {
    expect(canonicalizeTranslationLanguageCode("fil-PH")).toBe("tl");
    expect(canonicalizeTranslationLanguageCode("iw-IL")).toBe("he");
    expect(canonicalizeTranslationLanguageCode("zh")).toBe("zh");
    expect(canonicalizeTranslationLanguageCode("zh-TW")).toBe("zh-TW");
    expect(canonicalizeTranslationLanguageCode("zh-Hant")).toBe("zh-TW");
    expect(canonicalizeTranslationLanguageCode("zh-CN")).toBe("zh-CN");
    expect(canonicalizeTranslationLanguageCode("zh-Hans")).toBe("zh-CN");
    expect(canonicalizeTranslationLanguageCode("nb-NO")).toBe("no");
    expect(canonicalizeTranslationLanguageCode("in-ID")).toBe("id");
  });

  it("returns display names for canonical codes", () => {
    expect(getTranslationLanguageName("tl")).toBe("Tagalog");
    expect(getTranslationLanguageName("he")).toBe("Hebrew");
    expect(getTranslationLanguageName("zh-TW")).toBe("Chinese Traditional");
    expect(getTranslationLanguageName("xx")).toBeNull();
  });
});
