import { describe, expect, it } from "vitest";
import { getConversationCopy } from "@/i18n/conversations";
import type { AppLocale } from "@/i18n/config";
import { resolveConversationSearchBarLabels } from "./conversation-search-bar";

describe("resolveConversationSearchBarLabels", () => {
  it("reuses the existing conversation dictionary strings", () => {
    const ko = getConversationCopy("ko");
    const labels = resolveConversationSearchBarLabels(ko);
    expect(labels.placeholder).toBe(ko.searchPlaceholder);
    expect(labels.accessibleName).toBe(ko.searchButtonLabel);
  });

  it("resolves non-empty labels for every primary UI locale", () => {
    const locales: AppLocale[] = ["ko", "en", "ja", "zh-CN", "fr", "de", "es", "pt", "it", "ru", "ar", "hi", "th", "vi"];
    for (const locale of locales) {
      const labels = resolveConversationSearchBarLabels(getConversationCopy(locale));
      expect(labels.placeholder.length).toBeGreaterThan(0);
      expect(labels.accessibleName.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the button label when a placeholder is missing", () => {
    const copy = {
      ...getConversationCopy("en"),
      searchPlaceholder: "",
      searchButtonLabel: "Search",
    };
    expect(resolveConversationSearchBarLabels(copy).placeholder).toBe("Search");
  });
});
