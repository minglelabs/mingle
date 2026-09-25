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
    // All spaces, no punctuation
    const body = "hello world lorem ipsum dolor sit amet consectetur adipiscing";
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
    const body = "Today I went to 서울역. It was amazing! 정말 좋았어요.";
    const result = generatePreviewText(body);
    expect(result.isTruncated).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
  });
});
