import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePeopleSafetyCopy } from "@/i18n/people-safety-copy";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import { parsePeopleDiscoveryFilters } from "@/server/people-discovery";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("explore language filters", () => {
  it("reads each language on its own, and nothing by default", () => {
    expect(parsePeopleDiscoveryFilters(new URLSearchParams())).toMatchObject({ primaryLanguage: null, interestLanguage: null });
    expect(parsePeopleDiscoveryFilters(new URLSearchParams("primaryLanguage=ko"))).toMatchObject({ primaryLanguage: "ko", interestLanguage: null });
    expect(parsePeopleDiscoveryFilters(new URLSearchParams("interestLanguage=zh-CN"))).toMatchObject({ primaryLanguage: null, interestLanguage: "zh-cn" });
    // Not a language code: left out.
    expect(parsePeopleDiscoveryFilters(new URLSearchParams("primaryLanguage=ko'%20OR%201=1"))).toMatchObject({ primaryLanguage: null });
  });

  it("matches against the profile's own languages and its 관심 언어", () => {
    const sql = read("src/server/people-discovery.ts");
    expect(sql).toContain("unnest(u.primary_languages) AS own(code) WHERE lower(own.code) = ${filters.primaryLanguage}");
    expect(sql).toContain("unnest(u.interest_languages) AS wanted(code) WHERE lower(wanted.code) = ${filters.interestLanguage}");
  });

  it("is two pickers in the filter sheet, off until picked, in every app language", () => {
    const sheet = read("src/components/explore/explore-filter-sheet.tsx");
    expect(sheet).toContain("primaryLanguage: null, interestLanguage: null };");
    expect(sheet).toContain("data-qa={`explore-filter-${field.key}`}");
    expect(sheet).toContain("if (filters.primaryLanguage) params.primaryLanguage = filters.primaryLanguage;");
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolvePeopleSafetyCopy(locale);
      expect(copy.filterOwnLanguage.length).toBeGreaterThan(0);
      expect(copy.filterInterestLanguage.length).toBeGreaterThan(0);
    }
  });

  it("fills only the head of the voice tab's microphone when it is the current tab", () => {
    const bar = read("src/components/bottom-tab-bar.tsx");
    expect(bar).toContain('<rect x="9" y="2" width="6" height="13" rx="3" fill={isVoiceActive ? activeColor : "none"} />');
    // The cup and the stem are lines only.
    expect(bar).toContain('<path d="M19 10v2a7 7 0 0 1-14 0v-2" />');
    expect(bar).not.toContain("<Mic\n");
  });
});
