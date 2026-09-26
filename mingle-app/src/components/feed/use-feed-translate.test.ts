import { describe, expect, it } from "vitest";
import {
  hasTranslatableBody,
  resolveShownText,
  resolveTranslateMode,
  seedTranslateState,
  shouldToastTranslateFailure,
  translateReducer,
  type TranslateState,
} from "./use-feed-translate";

const seeded = (translationState: Parameters<typeof seedTranslateState>[0]["translationState"], displayText: string | null = null) =>
  seedTranslateState({ translationState, displayText });

describe("translate state machine", () => {
  it("a DTO that arrives `failed` seeds retry mode but never counts as a request failure", () => {
    const state = seeded("failed");
    expect(state.failed).toBe(true);
    expect(state.requestFailureCount).toBe(0);
    expect(shouldToastTranslateFailure(0, state.requestFailureCount)).toBe(false);
    expect(resolveTranslateMode("failed", "안녕하세요", state)).toBe("retry");
  });

  it("a request the viewer made that fails bumps the counter (→ one toast)", () => {
    let state: TranslateState = seeded("none");
    state = translateReducer(state, { type: "request" });
    expect(resolveTranslateMode("none", "hola", state)).toBe("loading");
    state = translateReducer(state, { type: "failure" });
    expect(state.requestFailureCount).toBe(1);
    expect(shouldToastTranslateFailure(0, 1)).toBe(true);
    // Re-seeding (list refresh) never re-toasts.
    expect(shouldToastTranslateFailure(1, 1)).toBe(false);
  });

  it("a manual success shows the translation, and flip toggles back to the original", () => {
    let state: TranslateState = seeded("failed");
    state = translateReducer(state, { type: "request" });
    state = translateReducer(state, { type: "success", text: "Hello" });
    expect(state.showingTranslation).toBe(true);
    expect(resolveTranslateMode("failed", "안녕", state)).toBe("showOriginal");
    state = translateReducer(state, { type: "flip" });
    expect(state.showingTranslation).toBe(false);
    expect(resolveTranslateMode("failed", "안녕", state)).toBe("show");
  });

  it("a ready DTO seeds the translation as shown", () => {
    const state = seeded("ready", "Translated");
    expect(state.translatedText).toBe("Translated");
    expect(state.showingTranslation).toBe(true);
  });
});

describe("translate button visibility", () => {
  it("is hidden for an image-only post with no body", () => {
    expect(hasTranslatableBody("")).toBe(false);
    expect(hasTranslatableBody("  \n ")).toBe(false);
    for (const dtoState of ["none", "failed", "pending"] as const) {
      expect(resolveTranslateMode(dtoState, "", seeded(dtoState))).toBe("hidden");
    }
  });

  it("is hidden for same_language and shown otherwise", () => {
    expect(resolveTranslateMode("same_language", "hi", seeded("same_language"))).toBe("hidden");
    expect(resolveTranslateMode("none", "hi", seeded("none"))).toBe("show");
  });
});

describe("resolveShownText", () => {
  it("uses a manually fetched translation even though the DTO state is not ready", () => {
    expect(resolveShownText("원문", "Translated", true)).toBe("Translated");
  });
  it("falls back to the original when not showing or nothing fetched", () => {
    expect(resolveShownText("원문", "Translated", false)).toBe("원문");
    expect(resolveShownText("원문", null, true)).toBe("원문");
    expect(resolveShownText("원문", "", true)).toBe("원문");
  });
});
