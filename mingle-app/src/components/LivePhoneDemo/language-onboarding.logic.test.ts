import { describe, expect, it } from "vitest";

import {
  LANGUAGE_ONBOARDING_MAX_TARGET_LANGUAGES,
  resolveOnboardingDefaultSourceLanguage,
  resolveOnboardingDefaultTargetLanguages,
  resolveUiLocaleForSourceLanguage,
  shouldAutoOpenLanguageOnboarding,
} from "@/components/LivePhoneDemo/language-onboarding.logic";

describe("language-onboarding.logic", () => {
  describe("shouldAutoOpenLanguageOnboarding", () => {
    it("auto-opens when the user has never confirmed a choice", () => {
      expect(shouldAutoOpenLanguageOnboarding(false)).toBe(true);
    });

    it("stays closed once the user has confirmed a choice", () => {
      expect(shouldAutoOpenLanguageOnboarding(true)).toBe(false);
    });
  });

  describe("resolveOnboardingDefaultSourceLanguage", () => {
    it("prefers the first valid persisted speech language", () => {
      expect(resolveOnboardingDefaultSourceLanguage(["ja"], "en")).toBe("ja");
    });

    it("falls back to the ui locale when no speech language is persisted", () => {
      expect(resolveOnboardingDefaultSourceLanguage([], "ko")).toBe("ko");
    });

    it("falls back to english when neither is valid", () => {
      expect(resolveOnboardingDefaultSourceLanguage([], "xx-not-a-locale")).toBe("en");
    });
  });

  describe("resolveOnboardingDefaultTargetLanguages", () => {
    it("sanitizes and dedupes the persisted selection", () => {
      expect(resolveOnboardingDefaultTargetLanguages(["ko", "ko", "ja"], "en")).toEqual([
        "ko",
        "ja",
      ]);
    });

    it("caps the result at the max target language count", () => {
      const many = ["ko", "ja", "fr", "de", "es", "it", "pt"];
      expect(resolveOnboardingDefaultTargetLanguages(many, "en")).toHaveLength(
        LANGUAGE_ONBOARDING_MAX_TARGET_LANGUAGES,
      );
    });

    it("falls back to the source language when nothing is selected", () => {
      expect(resolveOnboardingDefaultTargetLanguages([], "ja")).toEqual(["ja"]);
    });
  });

  describe("resolveUiLocaleForSourceLanguage", () => {
    it("maps a supported speech language directly to its ui locale", () => {
      expect(resolveUiLocaleForSourceLanguage("ja")).toBe("ja");
      expect(resolveUiLocaleForSourceLanguage("zh-CN")).toBe("zh-CN");
    });

    it("falls back to the default locale for unsupported codes", () => {
      expect(resolveUiLocaleForSourceLanguage("not-a-real-code")).toBe("ko");
    });
  });
});
