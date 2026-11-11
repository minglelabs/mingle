import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import { CONTACT_SYNC_COPY_LOCALES, resolveContactSyncCopy } from "./contact-sync-copy";

describe("contact-sync-copy", () => {
  it("covers every primary UI locale with no empty string", () => {
    expect([...CONTACT_SYNC_COPY_LOCALES].sort()).toEqual([...PRIMARY_UI_LOCALES].sort());
    for (const locale of PRIMARY_UI_LOCALES) {
      for (const [key, value] of Object.entries(resolveContactSyncCopy(locale))) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("keeps the placeholders the screen fills in", () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolveContactSyncCopy(locale);
      for (const token of ["{name}", "{code}", "{coins}", "{link}"]) {
        expect(copy.inviteMessage, `${locale} ${token}`).toContain(token);
      }
      expect(copy.description).toContain("{coins}");
      expect(copy.redeemSuccess).toContain("{coins}");
    }
  });

  it("falls back to English for an unknown locale", () => {
    expect(resolveContactSyncCopy("xx").title).toBe("Sync contacts");
  });
});
