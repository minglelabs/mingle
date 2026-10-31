import { describe, expect, it } from "vitest";

import { resolveOnboardingLanguagePreferences } from "@/components/conversation-list.onboarding-languages";

describe("resolveOnboardingLanguagePreferences", () => {
  it("keeps the server languages and patches nothing for an existing profile", () => {
    const result = resolveOnboardingLanguagePreferences(
      { primaryLanguages: ["ko", "en"], defaultConversationLanguages: ["ko", "en", "ja"] },
      ["ko"],
      ["ko", "en", "ja"],
    );
    expect(result.primaryLanguages).toEqual(["ko", "en"]);
    expect(result.patch).toEqual({});
  });

  it("fills an empty profile from onboarding", () => {
    const result = resolveOnboardingLanguagePreferences(
      { primaryLanguages: [], defaultConversationLanguages: [] },
      ["ko"],
      ["ko", "en", "ja"],
      ["en"],
    );
    expect(result.patch).toEqual({ primaryLanguages: ["ko"], defaultConversationLanguages: ["ko", "en", "ja"] });
  });

  it("lets an onboarding interest language win over the same comfortable language", () => {
    const result = resolveOnboardingLanguagePreferences(
      { primaryLanguages: ["ko", "en"], defaultConversationLanguages: ["ko", "en", "ja"] },
      ["ko"],
      ["ko", "en", "ja"],
      ["en"],
    );
    expect(result.primaryLanguages).toEqual(["ko"]);
    expect(result.patch).toEqual({ primaryLanguages: ["ko"] });
  });

  it("falls back to the onboarding pick when the interest language was the only comfortable one", () => {
    const result = resolveOnboardingLanguagePreferences(
      { primaryLanguages: ["en"], defaultConversationLanguages: ["en", "ko"] },
      ["ko"],
      ["ko", "en", "ja"],
      ["en"],
    );
    expect(result.primaryLanguages).toEqual(["ko"]);
    expect(result.patch).toEqual({ primaryLanguages: ["ko"] });
  });

  it("keeps the server list when no comfortable language would remain", () => {
    const result = resolveOnboardingLanguagePreferences(
      { primaryLanguages: ["en"], defaultConversationLanguages: ["en"] },
      ["en"],
      ["en"],
      ["en"],
    );
    expect(result.primaryLanguages).toEqual(["en"]);
    expect(result.patch).toEqual({});
  });

  it("ignores interest languages that do not overlap", () => {
    const result = resolveOnboardingLanguagePreferences(
      { primaryLanguages: ["ko"], defaultConversationLanguages: ["ko", "en"] },
      ["ko"],
      ["ko", "en"],
      ["ja"],
    );
    expect(result.patch).toEqual({});
  });
});
