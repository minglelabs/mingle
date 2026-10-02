import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import { fillCoinCopy, getCoinCopy } from "./coin-copy";

describe("coin copy", () => {
  const reference = getCoinCopy("ko");
  const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

  it.each(PRIMARY_UI_LOCALES)("%s has every key, non-empty, with the same placeholders as ko", (locale) => {
    const copy = getCoinCopy(locale);
    expect(Object.keys(copy).sort()).toEqual(Object.keys(reference).sort());
    for (const key of Object.keys(reference) as Array<keyof typeof reference>) {
      expect(copy[key].trim(), `${locale}.${key}`).not.toBe("");
      expect(placeholders(copy[key]), `${locale}.${key}`).toEqual(placeholders(reference[key]));
    }
  });

  it("fills placeholders and leaves unknown ones", () => {
    expect(fillCoinCopy("{free} / {paid} / {other}", { free: 1, paid: "2" })).toBe("1 / 2 / {other}");
  });
});
