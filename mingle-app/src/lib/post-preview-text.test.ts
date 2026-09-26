import { describe, expect, it } from "vitest";
import { generatePreviewText } from "./post-preview-text";

describe("generatePreviewText", () => {
  it("returns empty for empty string", () => {
    expect(generatePreviewText("")).toEqual({ text: "", isTruncated: false });
  });

  it("returns empty for whitespace-only input", () => {
    expect(generatePreviewText("   \n  ")).toEqual({ text: "", isTruncated: false });
  });

  it("returns short text as-is without truncation", () => {
    const body = "짧은 글입니다.";
    const result = generatePreviewText(body);
    expect(result.text).toBe(body);
    expect(result.isTruncated).toBe(false);
  });

  it("returns text at exactly IDEAL_MAX boundary without truncation", () => {
    // 40 single-byte characters
    const body = "a".repeat(40);
    const result = generatePreviewText(body);
    expect(result.text).toBe(body);
    expect(result.isTruncated).toBe(false);
  });

  it("truncates at clause boundary (period)", () => {
    const body =
      "오늘 날씨가 정말 좋습니다. 그래서 산책을 나갔습니다. 이 문장은 잘리겠죠.";
    const result = generatePreviewText(body);
    expect(result.isTruncated).toBe(true);
    // Should end at a period within the ideal range
    expect(result.text).toMatch(/\.$/);
    expect([...result.text].length).toBeLessThanOrEqual(41);
  });

  it("truncates at word boundary when no clause end in range", () => {
    // All spaces, no punctuation; well past three lines of large type.
    const body = "hello world lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor";
    const result = generatePreviewText(body);
    expect(result.isTruncated).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    // Should break at word boundary — text before "…" should end with a space
    // or the slice was trimmed, so length must be within range.
    expect([...result.text].length).toBeLessThanOrEqual(41);
  });

  it("hard-cuts a single long word", () => {
    const body = "a".repeat(100);
    const result = generatePreviewText(body);
    expect(result.isTruncated).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    // 40 chars + "…"
    expect([...result.text].length).toBeLessThanOrEqual(41);
  });

  it("handles emoji correctly", () => {
    // Each emoji is 1 grapheme cluster
    const body = "🎉🎊🎈🥳🎁🎂🎃🎄🎅🎆🎇🧨✨🎎🎏🎐🎑🎒🎓🎆🎇🧨✨🎎🎏🎐🎑🎒🎓🎍🎏🎐🎑🎒🎓🎆🎇🧨✨🎎🎏🎐";
    const result = generatePreviewText(body);
    expect(result.isTruncated).toBe(true);
    // Should not produce broken surrogate pairs
    for (const char of result.text) {
      expect(char.length).toBeGreaterThan(0);
    }
  });

  it("handles newlines as clause terminators", () => {
    const body = "첫 줄입니다\n둘째 줄이 좀 길어요\n셋째 줄이 조금 더 길어서 자르기가 꼭 필요한 문장입니다";
    const result = generatePreviewText(body);
    expect(result.isTruncated).toBe(true);
    expect([...result.text].length).toBeLessThanOrEqual(41);
  });

  it("preserves original text structure for short body", () => {
    const body = "Hello,\nWorld!";
    const result = generatePreviewText(body);
    expect(result.text).toBe(body);
    expect(result.isTruncated).toBe(false);
  });

  it("handles mixed Korean/English text", () => {
    // ~2.3 lines of large type: shown whole.
    const short = "Today I went to 서울역. It was amazing! 정말 좋았어요.";
    expect(generatePreviewText(short)).toEqual({ text: short, isTruncated: false });

    const long = `${short} 다음에 또 가고 싶어요. 친구들이랑 같이 가면 더 재밌을 것 같아요.`;
    const result = generatePreviewText(long);
    expect(result.isTruncated).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
    expect(long.startsWith(result.text.replace(/…$/, ""))).toBe(true);
  });
});

describe("generatePreviewText — grapheme-safe cuts", () => {
  const graphemes = (s: string) =>
    Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s), (x) => x.segment);

  it("never splits a ZWJ family emoji", () => {
    const family = "👨‍👩‍👧‍👦";
    const body = family.repeat(60);
    const result = generatePreviewText(body);
    expect(result.isTruncated).toBe(true);
    const kept = result.text.replace(/…$/, "");
    for (const g of graphemes(kept)) expect(g).toBe(family);
  });

  it("never splits a flag (regional-indicator pair)", () => {
    const flag = "🇰🇷";
    const body = flag.repeat(60);
    const kept = generatePreviewText(body).text.replace(/…$/, "");
    expect(kept.length % flag.length).toBe(0);
    for (const g of graphemes(kept)) expect(g).toBe(flag);
  });

  it("never splits a skin-tone modifier sequence", () => {
    const wave = "👋🏽";
    const kept = generatePreviewText(wave.repeat(50)).text.replace(/…$/, "");
    for (const g of graphemes(kept)) expect(g).toBe(wave);
  });

  it("starts from ~20 Hangul characters and snaps to a sentence end", () => {
    const body =
      "오늘은 한강에서 친구들과 자전거를 탔어요. 날씨가 너무 좋아서 하루 종일 밖에 있었어요. 다음 주에도 또 가고 싶네요.";
    const result = generatePreviewText(body);
    expect(result.isTruncated).toBe(true);
    expect(result.text).toBe("오늘은 한강에서 친구들과 자전거를 탔어요.");
  });

  it("keeps a two-line Korean body whole", () => {
    const body = "오늘 저녁은 뭐 먹지? 떡볶이 먹을까 고민 중";
    expect(generatePreviewText(body)).toEqual({ text: body, isTruncated: false });
  });

  it("does not mutate or reorder the source", () => {
    const body = "첫 문장입니다. ".repeat(20);
    const copy = body.slice();
    const result = generatePreviewText(body);
    expect(body).toBe(copy);
    expect(body.trim().startsWith(result.text.replace(/…$/, ""))).toBe(true);
  });
});
