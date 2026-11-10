import { describe, expect, it } from "vitest";
import {
  hasConfirmedLanguageOnboarding,
  markLanguageOnboardingConfirmed,
  persistLanguageOnboardingChoice,
} from "@/components/LivePhoneDemo/language-onboarding.storage";
import {
  LS_KEY_PENDING_BIRTH_DATE,
  LS_KEY_PENDING_GENDER,
  LS_KEY_PENDING_PRIMARY_LANGUAGES,
  LS_KEY_PENDING_USAGE_PURPOSE_NOTE,
} from "@/components/LivePhoneDemo/live-phone-demo.preferences";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("language onboarding storage", () => {
  it("is unconfirmed on a fresh device and confirmed once marked", () => {
    const storage = createStorage();
    expect(hasConfirmedLanguageOnboarding(storage)).toBe(false);
    markLanguageOnboardingConfirmed(storage);
    expect(hasConfirmedLanguageOnboarding(storage)).toBe(true);
  });

  it("keeps the answers for sign-up without marking onboarding confirmed", () => {
    const storage = createStorage({ [LS_KEY_PENDING_USAGE_PURPOSE_NOTE]: "stale" });
    const choice = persistLanguageOnboardingChoice({
      language: "ko",
      interestLanguage: null,
      birthDate: { year: 1995, month: 3, day: 9 },
      gender: "female",
      usagePurpose: "social",
      usagePurposeNote: null,
      discoverySource: "friend",
    } as Parameters<typeof persistLanguageOnboardingChoice>[0], storage);

    expect(choice.languageCode).toBe("ko");
    expect(choice.defaultConversationLanguages[0]).toBe("ko");
    expect(JSON.parse(storage.values.get(LS_KEY_PENDING_PRIMARY_LANGUAGES) ?? "[]")).toEqual(["ko"]);
    expect(storage.values.get(LS_KEY_PENDING_BIRTH_DATE)).toBe(choice.formattedBirthDate);
    expect(choice.formattedBirthDate).toBeTruthy();
    expect(storage.values.get(LS_KEY_PENDING_GENDER)).toBe("female");
    expect(storage.values.has(LS_KEY_PENDING_USAGE_PURPOSE_NOTE)).toBe(false);
    expect(hasConfirmedLanguageOnboarding(storage)).toBe(false);
  });

  it("accepts a bare language code and survives missing storage", () => {
    expect(persistLanguageOnboardingChoice("ja", null)).toMatchObject({
      languageCode: "ja",
      formattedBirthDate: null,
      gender: null,
      interestLanguages: [],
    });
    expect(hasConfirmedLanguageOnboarding(null)).toBe(false);
  });
});
