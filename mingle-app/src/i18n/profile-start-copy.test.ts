import { describe, expect, it } from "vitest";
import { PROFILE_START_COPY_LOCALES, needsProfileStart, resolveProfileStartCopy } from "./profile-start-copy";

describe("profile start copy", () => {
  it("has every one of the 15 app languages, with no empty text", () => {
    expect(PROFILE_START_COPY_LOCALES).toHaveLength(15);
    for (const locale of PROFILE_START_COPY_LOCALES) {
      for (const value of Object.values(resolveProfileStartCopy(locale))) expect(value.trim()).not.toBe("");
    }
  });

  it("falls back to English for a language it does not know", () => {
    expect(resolveProfileStartCopy("xx").save).toBe("Save");
  });
});

describe("needsProfileStart", () => {
  it("asks an account with no photo, no name, or the default name", () => {
    expect(needsProfileStart({ name: "Mina", image: null })).toBe(true);
    expect(needsProfileStart({ name: "HashChat User", image: "https://x/y.jpg" })).toBe(true);
    expect(needsProfileStart({ name: " ", image: "https://x/y.jpg" })).toBe(true);
  });

  it("leaves a profile with both alone, and an unreadable profile too", () => {
    expect(needsProfileStart({ name: "Mina", image: "https://x/y.jpg" })).toBe(false);
    expect(needsProfileStart(null)).toBe(false);
  });
});
