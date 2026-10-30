import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import { resolveAccessibilityCopy } from "@/i18n/accessibility-copy";
import { messageReactionCopy } from "@/lib/message-reactions";
import { messageRecallCopy } from "@/lib/message-recall";

// Room/chat copy that used to cover only ko/ja/en must resolve to a
// locale-specific string for every primary UI locale.
describe("chat copy covers all 15 primary UI locales", () => {
  const resolvers = {
    accessibility: resolveAccessibilityCopy,
    reaction: messageReactionCopy,
    recall: messageRecallCopy,
  };

  for (const [name, resolve] of Object.entries(resolvers)) {
    it(name, () => {
      const english = resolve("en") as Record<string, string>;
      for (const locale of PRIMARY_UI_LOCALES) {
        const copy = resolve(locale) as Record<string, string>;
        for (const [key, value] of Object.entries(english)) {
          expect(copy[key]?.trim(), `${locale}.${key}`).toBeTruthy();
          if (locale !== "en") expect(copy[key], `${locale}.${key}`).not.toBe(value);
        }
      }
    });
  }
});
