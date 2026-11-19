import { describe, expect, it } from "vitest";
import { BAN_NOTICE_CATEGORIES, HOME_COPY_LOCALES, fillHomeCount, resolveHomeCopy } from "./home-copy";

describe("home copy", () => {
  it("has every string in all 15 app languages", () => {
    expect(HOME_COPY_LOCALES).toHaveLength(15);
    const keys = Object.keys(resolveHomeCopy("en")).sort();
    for (const locale of HOME_COPY_LOCALES) {
      const copy = resolveHomeCopy(locale);
      expect(Object.keys(copy).sort()).toEqual(keys);
      for (const [key, value] of Object.entries(copy)) {
        if (key === "banCategory") continue;
        expect(String(value).trim(), `${locale}.${key}`).not.toBe("");
      }
      for (const category of BAN_NOTICE_CATEGORIES) expect(copy.banCategory[category].trim(), `${locale}.${category}`).not.toBe("");
      expect(copy.banStrip).toContain("{count}");
      expect(copy.dailyLimit).toContain("{count}");
    }
  });

  it("falls back to English and fills the count", () => {
    expect(resolveHomeCopy("xx").tabLabel).toBe("Home");
    expect(resolveHomeCopy("ko-KR").tabLabel).toBe("홈");
    expect(fillHomeCount(resolveHomeCopy("ko").banStrip, 3)).toBe("이번 주 영구 퇴출 3명");
  });
});
