import { describe, expect, it } from "vitest";
import { resolveGridTilePreview, resolveGridTileText, type GridTilePostFields } from "./post-grid-tile-text";

function post(fields: Partial<GridTilePostFields>): GridTilePostFields {
  return {
    sourceText: "",
    displayText: null,
    translationState: "none",
    ...fields,
  };
}

describe("resolveGridTileText", () => {
  it("shows the translation only when it is ready", () => {
    expect(resolveGridTileText(post({
      sourceText: "안녕하세요",
      displayText: "Hello",
      translationState: "ready",
    }))).toBe("Hello");
  });

  it("shows the source text for every non-ready state", () => {
    for (const translationState of ["same_language", "pending", "failed", "none"] as const) {
      expect(resolveGridTileText(post({
        sourceText: "안녕하세요",
        displayText: "Hello",
        translationState,
      }))).toBe("안녕하세요");
    }
  });

  it("falls back to the source text when the ready translation is blank", () => {
    expect(resolveGridTileText(post({
      sourceText: "원문",
      displayText: "   ",
      translationState: "ready",
    }))).toBe("원문");
  });
});

describe("resolveGridTilePreview", () => {
  it("returns a short body in full", () => {
    expect(resolveGridTilePreview(post({ sourceText: "짧은 글", translationState: "same_language" })))
      .toEqual({ text: "짧은 글", isTruncated: false });
  });

  it("truncates a long body", () => {
    const preview = resolveGridTilePreview(post({
      sourceText: "This is a very long body that clearly exceeds the ideal preview length by a lot",
      translationState: "same_language",
    }));
    expect(preview.isTruncated).toBe(true);
    expect(preview.text.length).toBeLessThan(70);
  });
});
