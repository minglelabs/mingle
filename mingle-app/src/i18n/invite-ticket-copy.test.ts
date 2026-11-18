import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import {
  INVITE_TICKET_COPY_LOCALES,
  buildInviteSharedLinkMessage,
  buildInviteTicketMessage,
  fillInviteTicketCopy,
  resolveDefaultInviteMessageLocale,
  resolveInviteLandingLocale,
  resolveInviteTicketCopy,
} from "./invite-ticket-copy";

describe("invite-ticket-copy", () => {
  it("covers every primary UI locale with no empty string", () => {
    expect([...INVITE_TICKET_COPY_LOCALES].sort()).toEqual([...PRIMARY_UI_LOCALES].sort());
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolveInviteTicketCopy(locale);
      for (const [key, value] of Object.entries(copy)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
      for (const key of ["ticketFrom", "landingHeadline", "landingBody", "joinedToast"] as const) {
        expect(copy[key], `${locale}.${key}`).toContain("{name}");
      }
      for (const key of ["ticketBenefit", "landingReward"] as const) {
        expect(copy[key], `${locale}.${key}`).toContain("{coins}");
      }
    }
  });

  it("fills the name and the reward", () => {
    expect(fillInviteTicketCopy("{name}: {coins}", { name: "미나", coins: 1000 })).toBe("미나: 1,000");
  });

  it("writes the pasted message in the one picked language only", () => {
    const korean = buildInviteTicketMessage("ko", "https://x.test/i/ab3de", "ab3de").split("\n");
    expect(korean).toEqual([
      resolveInviteTicketCopy("ko").message,
      "https://x.test/i/ab3de",
      "초대 코드 ab3de · 앱을 설치한 뒤 이 링크를 한 번 더 눌러 주세요",
    ]);
    const japanese = buildInviteTicketMessage("ja", "L", "ab3de").split("\n");
    expect(japanese[0]).toBe(resolveInviteTicketCopy("ja").message);
    expect(japanese[2]).toBe("招待コード ab3de · アプリをインストールしたら、このリンクをもう一度タップしてね");
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolveInviteTicketCopy(locale);
      expect(buildInviteTicketMessage(locale, "L", "ab3de"), locale).toBe(
        [copy.message, "L", `${copy.codeLine.replaceAll("{code}", "ab3de")} · ${copy.reopenHint}`].join("\n"),
      );
    }
    // Without a code only the reopen note follows the link.
    expect(buildInviteTicketMessage("en", "L", null).split("\n")).toHaveLength(3);
  });

  it("defaults the message to the UI language, English for a Korean UI", () => {
    expect(resolveDefaultInviteMessageLocale("ko")).toBe("en");
    expect(resolveDefaultInviteMessageLocale("ko-KR")).toBe("en");
    expect(resolveDefaultInviteMessageLocale("ja")).toBe("ja");
    expect(resolveDefaultInviteMessageLocale("fr")).toBe("fr");
    expect(resolveDefaultInviteMessageLocale("zh-TW")).toBe("zh-TW");
    expect(resolveDefaultInviteMessageLocale("xx")).toBe("en");
  });

  it("puts the code and the reopen note under every shared link, in every locale", () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      expect(resolveInviteTicketCopy(locale).codeLine, locale).toContain("{code}");
      const lines = buildInviteSharedLinkMessage(locale, "https://x.test/u/1", "ab3de").split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe("https://x.test/u/1");
      expect(lines[1], locale).toContain("ab3de");
    }
    // Without a code (signed out, offline) only the reopen note is added.
    expect(buildInviteSharedLinkMessage("en", "L", null)).toBe("L\nAfter installing the app, tap this link once more");
  });

  it("picks the landing language from the browser, Japanese when unknown", () => {
    expect(resolveInviteLandingLocale("ja-JP,ja;q=0.9,en;q=0.8")).toBe("ja");
    expect(resolveInviteLandingLocale("en;q=0.5,ko-KR;q=0.9")).toBe("ko");
    expect(resolveInviteLandingLocale("")).toBe("ja");
    expect(resolveInviteLandingLocale(null)).toBe("ja");
    expect(resolveInviteLandingLocale("xx-YY")).toBe("ja");
  });
});
