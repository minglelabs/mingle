import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LOCALES } from "./mingle-locales";
import { LOADING_MESSAGES, pickLoadingMessage, resolveLoadingMessages } from "./loading-messages";

describe("loading messages", () => {
  it("every entry has Korean text", () => {
    for (const message of LOADING_MESSAGES) expect(message.text.ko?.trim()).toBeTruthy();
  });

  it("Korean gets every line, including proverbs with their source", () => {
    const messages = resolveLoadingMessages("ko");
    expect(messages).toHaveLength(LOADING_MESSAGES.length);
    expect(messages).toContainEqual({ text: "로그인 각도 좁히는 중..", source: null });
    expect(messages).toContainEqual({ text: "티끌 모아 태산", source: "한국 속담" });
    expect(messages).toContainEqual({ text: "내 언어의 한계는 내 세계의 한계다", source: "비트겐슈타인" });
  });

  it("English skips the Korean-only proverbs", () => {
    const messages = resolveLoadingMessages("en");
    expect(messages.some((m) => m.source === "한국 속담")).toBe(false);
    expect(messages.length).toBeGreaterThan(1);
  });

  it("every UI locale and unknown locales get at least one non-empty line", () => {
    for (const locale of [...PRIMARY_UI_LOCALES, "af", "xx-unknown", "", null]) {
      const messages = resolveLoadingMessages(locale);
      expect(messages.length).toBeGreaterThan(0);
      for (const message of messages) expect(message.text.trim()).not.toBe("");
    }
  });

  it("picks within range at both ends of the random range", () => {
    const messages = resolveLoadingMessages("ko");
    expect(pickLoadingMessage("ko", () => 0)).toEqual(messages[0]);
    expect(pickLoadingMessage("ko", () => 0.999999)).toEqual(messages[messages.length - 1]);
    expect(pickLoadingMessage("ko", () => 1)).toEqual(messages[messages.length - 1]);
  });
});
