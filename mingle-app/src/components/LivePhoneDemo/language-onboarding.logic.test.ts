import { describe, expect, it } from "vitest";

import {
  resolveOnboardingDefaultLanguage,
  resolveUiLocaleForLanguage,
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

  describe("resolveOnboardingDefaultLanguage", () => {
    it("prefers the first valid persisted language", () => {
      expect(resolveOnboardingDefaultLanguage(["ja"], "en")).toBe("ja");
    });

    it("falls back to the ui locale when no language is persisted", () => {
      expect(resolveOnboardingDefaultLanguage([], "ko")).toBe("ko");
    });

    it("falls back to english when neither is valid", () => {
      expect(resolveOnboardingDefaultLanguage([], "xx-not-a-locale")).toBe("en");
    });

    it("prefers the ui locale's language over just the first entry when both are among the persisted defaults", () => {
      // A brand-new anonymous user's persisted language list is always the fixed
      // ['en', 'ko', 'ja'] triple (see deriveDefaultSttLanguagesForLocale), not a real
      // recorded preference -- so for onboarding's "default to my locale" purpose, the
      // ui locale should win over "whichever one happens to be listed first".
      expect(resolveOnboardingDefaultLanguage(["en", "ko", "ja"], "ko")).toBe("ko");
      expect(resolveOnboardingDefaultLanguage(["en", "ko", "ja"], "ja")).toBe("ja");
    });

    it("still prefers the first persisted language when the ui locale isn't among the persisted options", () => {
      // Here the persisted list represents a genuine past choice (not the untouched
      // default triple), so it should keep winning over the current browsing locale.
      expect(resolveOnboardingDefaultLanguage(["fr"], "ko")).toBe("fr");
    });
  });

  describe("resolveUiLocaleForLanguage", () => {
    it("maps a supported language directly to its ui locale", () => {
      expect(resolveUiLocaleForLanguage("ja")).toBe("ja");
      expect(resolveUiLocaleForLanguage("zh-CN")).toBe("zh-CN");
    });

    it("falls back to the default locale for unsupported codes", () => {
      expect(resolveUiLocaleForLanguage("not-a-real-code")).toBe("ko");
    });
  });
});
