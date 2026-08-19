import { describe, expect, it } from "vitest";
import {
  composeDictationDraft,
  normalizeDictationLanguage,
  normalizeDictationText,
  parseDictationTranscript,
} from "./voice-dictation.logic";

function transcriptMessage(input: {
  text: string;
  language?: string;
  isFinal?: boolean;
}): string {
  return JSON.stringify({
    type: "transcript",
    data: {
      is_final: input.isFinal ?? false,
      utterance: { text: input.text, language: input.language ?? "es" },
    },
  });
}

describe("parseDictationTranscript", () => {
  it("reads text, canonicalized language, and finality", () => {
    expect(parseDictationTranscript(
      transcriptMessage({ text: "hola mundo", language: "es", isFinal: true }),
    )).toEqual({ text: "hola mundo", language: "es", isFinal: true });
  });

  it("treats a missing is_final as a partial", () => {
    expect(parseDictationTranscript(
      JSON.stringify({ type: "transcript", data: { utterance: { text: "hola" } } }),
    )).toEqual({ text: "hola", language: "", isFinal: false });
  });

  it("ignores non-transcript envelopes, malformed JSON, and empty turns", () => {
    expect(parseDictationTranscript(JSON.stringify({ type: "usage", data: {} }))).toBeNull();
    expect(parseDictationTranscript("not json at all")).toBeNull();
    expect(parseDictationTranscript(transcriptMessage({ text: "   " }))).toBeNull();
    expect(parseDictationTranscript(transcriptMessage({ text: "<end>" }))).toBeNull();
  });
});

describe("normalizeDictationText", () => {
  it("strips segmentation markers and leading punctuation", () => {
    expect(normalizeDictationText("<fin>, 안녕하세요<end>")).toBe("안녕하세요");
  });
});

describe("normalizeDictationLanguage", () => {
  it("resolves bare Chinese to the simplified variant the translator expects", () => {
    expect(normalizeDictationLanguage("zh")).toBe("zh-CN");
    expect(normalizeDictationLanguage("zh-TW")).toBe("zh-TW");
  });

  it("keeps an unrecognized tag rather than dropping it", () => {
    expect(normalizeDictationLanguage("qq_XX")).toBe("qq-XX");
    expect(normalizeDictationLanguage("")).toBe("");
  });
});

describe("composeDictationDraft", () => {
  it("appends spoken turns after text the user had already typed", () => {
    expect(composeDictationDraft({
      baseText: "먼저 쓴 말 ",
      finalizedTurns: ["첫 문장이에요"],
      partialTurn: "그리고 지금",
    })).toBe("먼저 쓴 말 첫 문장이에요 그리고 지금");
  });

  it("replaces rather than accumulates the in-flight turn", () => {
    const afterFirstPartial = composeDictationDraft({
      baseText: "",
      finalizedTurns: [],
      partialTurn: "hola",
    });
    const afterSecondPartial = composeDictationDraft({
      baseText: "",
      finalizedTurns: [],
      partialTurn: "hola mundo",
    });

    expect(afterFirstPartial).toBe("hola");
    expect(afterSecondPartial).toBe("hola mundo");
  });

  it("returns the untouched base while nothing has been heard yet", () => {
    expect(composeDictationDraft({
      baseText: "typed only",
      finalizedTurns: [],
      partialTurn: "",
    })).toBe("typed only");
  });
});
