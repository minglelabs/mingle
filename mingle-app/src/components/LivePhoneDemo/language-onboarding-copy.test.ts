import { describe, expect, it } from "vitest";

import { resolveLanguageOnboardingCopy } from "@/components/LivePhoneDemo/language-onboarding-copy";

describe("resolveLanguageOnboardingCopy", () => {
  it("returns the matching locale's copy", () => {
    expect(resolveLanguageOnboardingCopy("ko").title).toBe("보고 싶은 언어를 선택해주세요");
    expect(resolveLanguageOnboardingCopy("en").title).toBe("Choose the language you want to see");
    expect(resolveLanguageOnboardingCopy("ja").title).toBe("見たい言語を選択してください");
  });

  it("keeps Simplified and Traditional Chinese copy distinct", () => {
    expect(resolveLanguageOnboardingCopy("zh-CN").confirmButtonLabel).toBe("开始使用");
    expect(resolveLanguageOnboardingCopy("zh-TW").confirmButtonLabel).toBe("開始使用");
  });

  it("normalizes region-tagged locales to their base language", () => {
    expect(resolveLanguageOnboardingCopy("ko-KR")).toEqual(resolveLanguageOnboardingCopy("ko"));
  });

  // The onboarding modal now feeds whichever language the user taps straight
  // into this function to live-preview the picker's own text -- so a locale
  // with no dedicated copy of its own must still resolve to a real fallback
  // bucket's copy rather than throw or return undefined fields.
  it("groups a supported locale with no dedicated copy into its legal-document fallback bucket", () => {
    expect(resolveLanguageOnboardingCopy("af")).toEqual(resolveLanguageOnboardingCopy("en"));
  });

  it("falls back to the default locale's copy for a value that isn't a locale at all", () => {
    expect(resolveLanguageOnboardingCopy("not-a-real-code")).toEqual(resolveLanguageOnboardingCopy("ko"));
  });
});
