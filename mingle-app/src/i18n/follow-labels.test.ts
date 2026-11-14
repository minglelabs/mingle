import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n/get-dictionary";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";

// The machine-translated catalog once rendered "following" (the follow count) as "next" /
// "the following" (ru "следующий", ar "التالية", hi "निम्नलिखित", th "ต่อไปนี้"). Found by the
// on-device locale sweep on the profile stats.
const NOT_A_FOLLOW_COUNT = /следующ|التالية|निम्नलिखित|ต่อไปนี้|追随者|追隨者/;

describe("profile follow count labels", () => {
  it.each(PRIMARY_UI_LOCALES)("%s labels followers and following as social counts", (locale) => {
    const profile = getDictionary(locale).profile;
    expect(profile.followersLabel).not.toMatch(NOT_A_FOLLOW_COUNT);
    expect(profile.followingLabel).not.toMatch(NOT_A_FOLLOW_COUNT);
    expect(profile.followersLabel).not.toBe(profile.followingLabel);
  });
});
