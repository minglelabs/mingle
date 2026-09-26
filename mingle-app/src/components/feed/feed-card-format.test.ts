import { describe, expect, it } from "vitest";
import { POST_FOREGROUND_COLOR } from "@/lib/post-backgrounds";
import {
  foregroundTokens,
  formatPostTime,
  imageAspectRatio,
  resolveCardTexts,
  shouldShowExpand,
} from "./feed-card-format";

describe("resolveCardTexts — centre preview, image snippet and expanded body agree", () => {
  const source = "오늘은 한강에서 친구들과 자전거를 탔어요. 날씨가 너무 좋아서 하루 종일 밖에 있었어요.";
  const translated = "I rode bikes with friends by the Han River today. The weather was so nice that I stayed out all day long.";

  it("shows the manual translation in all three places", () => {
    const t = resolveCardTexts(source, translated, true);
    expect(t.displayText).toBe(translated);
    expect(translated.startsWith(t.previewText.replace(/…$/, ""))).toBe(true);
  });

  it("'Show original' returns all three places to the source", () => {
    const t = resolveCardTexts(source, translated, false);
    expect(t.displayText).toBe(source);
    expect(source.startsWith(t.previewText.replace(/…$/, ""))).toBe(true);
  });

  it("truncation follows the shown language, not the original", () => {
    const shortTranslation = "Nice ride today.";
    expect(resolveCardTexts(source, shortTranslation, true).previewTruncated).toBe(false);
    expect(resolveCardTexts(source, shortTranslation, false).previewTruncated).toBe(true);
  });
});

describe("shouldShowExpand", () => {
  it("text posts: only when the shown preview was cut", () => {
    expect(shouldShowExpand({ hasImage: false, expanded: false, previewTruncated: true, clampOverflows: false })).toBe(true);
    expect(shouldShowExpand({ hasImage: false, expanded: false, previewTruncated: false, clampOverflows: true })).toBe(false);
  });
  it("image posts: only when the 3-line clamp overflows", () => {
    expect(shouldShowExpand({ hasImage: true, expanded: false, previewTruncated: true, clampOverflows: false })).toBe(false);
    expect(shouldShowExpand({ hasImage: true, expanded: false, previewTruncated: false, clampOverflows: true })).toBe(true);
  });
  it("never while expanded", () => {
    expect(shouldShowExpand({ hasImage: true, expanded: true, previewTruncated: true, clampOverflows: true })).toBe(false);
  });
});

describe("imageAspectRatio", () => {
  it("prefers the DTO size, then the measured size, else null", () => {
    expect(imageAspectRatio({ width: 1080, height: 1350 }, { width: 10, height: 10 })).toBe("1080 / 1350");
    expect(imageAspectRatio({ width: null, height: null }, { width: 800, height: 600 })).toBe("800 / 600");
    expect(imageAspectRatio({ width: null, height: null }, null)).toBeNull();
    expect(imageAspectRatio({ width: 0, height: 100 }, null)).toBeNull();
    expect(imageAspectRatio(null)).toBeNull();
  });
});

describe("formatPostTime", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  const ago = (sec: number) => new Date(now - sec * 1000).toISOString();

  it("uses the viewer locale for relative time", () => {
    expect(formatPostTime(ago(5 * 60), "ko", now)).toBe("5분 전");
    expect(formatPostTime(ago(2 * 3600), "ko", now)).toBe("2시간 전");
    expect(formatPostTime(ago(5 * 60), "en", now)).toBe(new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" }).format(-5, "minute"));
    expect(formatPostTime(ago(3 * 86400), "ja", now)).toBe(new Intl.RelativeTimeFormat("ja", { numeric: "auto", style: "short" }).format(-3, "day"));
  });

  it("says 'now' under a minute", () => {
    expect(formatPostTime(ago(10), "ko", now)).toBe("지금");
  });

  it("uses a localized date after a week (year only when different)", () => {
    const d = new Date(now - 20 * 86400 * 1000);
    expect(formatPostTime(d.toISOString(), "ko", now)).toBe(d.toLocaleDateString("ko", { month: "short", day: "numeric" }));
    const old = "2025-01-15T00:00:00Z";
    expect(formatPostTime(old, "de", now)).toBe(new Date(old).toLocaleDateString("de", { year: "numeric", month: "short", day: "numeric" }));
  });

  it("returns empty for an unparsable timestamp", () => {
    expect(formatPostTime("nope", "ko", now)).toBe("");
  });
});

describe("foregroundTokens", () => {
  it("dark tone uses dark ink without a shadow; light tone white with a shadow", () => {
    const dark = foregroundTokens("dark");
    expect(dark.iconColor).toBe(POST_FOREGROUND_COLOR.dark);
    expect(dark.iconFilter).toBeUndefined();
    expect(dark.textClass).not.toMatch(/text-white/);
    const light = foregroundTokens("light");
    expect(light.iconColor).toBe(POST_FOREGROUND_COLOR.light);
    expect(light.iconFilter).toMatch(/drop-shadow/);
    expect(light.textClass).toMatch(/drop-shadow/);
  });
});
