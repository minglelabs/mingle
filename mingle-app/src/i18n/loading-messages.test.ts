import { describe, expect, it } from "vitest";
import { LOADING_MESSAGES, pickLoadingMessage, resolveLoadingMessages } from "./loading-messages";

describe("loading messages", () => {
  it("has the login-angle line in Korean", () => {
    expect(resolveLoadingMessages("ko")).toContain("로그인 각도 좁히는 중..");
  });

  it("returns one line per entry for every locale, never empty", () => {
    for (const locale of ["ko", "en", "ja", "zh-TW", "af", "xx-unknown", "", null]) {
      const messages = resolveLoadingMessages(locale);
      expect(messages).toHaveLength(LOADING_MESSAGES.length);
      for (const message of messages) expect(message.trim()).not.toBe("");
    }
  });

  it("falls back to English for a locale without its own line", () => {
    expect(resolveLoadingMessages("xx-unknown")).toEqual(LOADING_MESSAGES.map((m) => m.en));
  });

  it("picks within range at both ends of the random range", () => {
    const messages = resolveLoadingMessages("ko");
    expect(pickLoadingMessage("ko", () => 0)).toBe(messages[0]);
    expect(pickLoadingMessage("ko", () => 0.999999)).toBe(messages[messages.length - 1]);
    expect(pickLoadingMessage("ko", () => 1)).toBe(messages[messages.length - 1]);
  });
});
