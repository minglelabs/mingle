import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import { PHONE_FRIENDS_COPY_LOCALES, fillPhoneFriendsCopy, resolvePhoneFriendsCopy } from "./phone-friends-copy";

describe("phone-friends-copy", () => {
  it("covers every primary UI locale with no empty string and keeps the placeholders", () => {
    expect([...PHONE_FRIENDS_COPY_LOCALES].sort()).toEqual([...PRIMARY_UI_LOCALES].sort());
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolvePhoneFriendsCopy(locale);
      for (const [key, value] of Object.entries(copy)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
      expect(copy.friendsOnHashChat, locale).toContain("{count}");
      for (const key of ["verifiedAs", "codeSent"] as const) expect(copy[key], `${locale}.${key}`).toContain("{phone}");
    }
  });

  it("fills a count and a number", () => {
    expect(fillPhoneFriendsCopy("{count} / {phone}", { count: 1200, phone: "+82 ••5678" })).toBe("1,200 / +82 ••5678");
  });
});
