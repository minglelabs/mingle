import { describe, expect, it } from "vitest";
import {
  isVoiceInternalRequestAuthorized,
  parseVoiceCaptionReport,
  parseVoicePlaybackReport,
  roomLanguagesOf,
} from "@/server/voice/voice-interpreter-reports";

describe("voice interpreter reports", () => {
  it("takes the shared secret, or the realtime secret when it is unset", () => {
    expect(isVoiceInternalRequestAuthorized("s1", { VOICE_INTERNAL_SECRET: "s1" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(isVoiceInternalRequestAuthorized("s2", { MINGLE_REALTIME_SECRET: "s2" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(isVoiceInternalRequestAuthorized("bad", { VOICE_INTERNAL_SECRET: "s1" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isVoiceInternalRequestAuthorized(null, { VOICE_INTERNAL_SECRET: "s1" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isVoiceInternalRequestAuthorized("", {} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("reads a caption and drops bad languages and the source's own translation", () => {
    expect(parseVoiceCaptionReport({
      room: "voice-c-1", id: "l1", speaker: "u1", lang: "ko", text: " 안녕 ",
      translations: { en: "Hi", ko: "안녕", "x!": "?", ja: "" }, durationMs: 1234.4, startedAt: 1700000000000.4,
    })).toEqual({ room: "voice-c-1", id: "l1", speaker: "u1", lang: "ko", text: "안녕", translations: { en: "Hi" }, durationMs: 1234, startedAt: 1700000000000 });
    expect(parseVoiceCaptionReport({ room: "r", id: "i", speaker: "u", lang: "ko" })).toBeNull();
    expect(parseVoiceCaptionReport(null)).toBeNull();
  });

  it("reads a playback with its listeners once each", () => {
    expect(parseVoicePlaybackReport({ room: "r", id: "i", lang: "en", listeners: ["a", "a", "", 3, "b"], audioMs: 800 }))
      .toEqual({ room: "r", id: "i", lang: "en", listeners: ["a", "b"], audioMs: 800 });
    expect(parseVoicePlaybackReport({ room: "r", id: "i", lang: "en", audioMs: -5 })?.audioMs).toBe(0);
  });

  it("translates captions into the room's languages: the members' picks in a shared room, the channel's alone", () => {
    expect(roomLanguagesOf({ selectedLanguages: ["ko"], members: [{ selectedLanguages: ["ko", "en"] }, { selectedLanguages: ["en", "ja"] }] }))
      .toEqual(["ko", "en", "ja"]);
    expect(roomLanguagesOf({ selectedLanguages: ["ko", "en"], members: [{ selectedLanguages: ["ja"] }] })).toEqual(["ko", "en"]);
  });
});
