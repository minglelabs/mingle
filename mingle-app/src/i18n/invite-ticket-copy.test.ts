import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import {
  INVITE_TICKET_COPY_LOCALES,
  buildInviteSharedLinkMessage,
  buildInviteTicketMessage,
  fillInviteTicketCopy,
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

  it("writes the pasted message for the Korean-Japanese pair in both languages, partner first", () => {
    const fromKorean = buildInviteTicketMessage("ko", "https://x.test/i/ab3de", "ab3de").split("\n");
    expect(fromKorean).toHaveLength(5);
    expect(fromKorean[0]).toContain("招待券");
    expect(fromKorean[1]).toContain("초대권");
    expect(fromKorean[2]).toBe("https://x.test/i/ab3de");
    expect(fromKorean[3]).toBe("招待コード ab3de · アプリをインストールしたら、このリンクをもう一度タップしてね");
    expect(fromKorean[4]).toBe("초대 코드 ab3de · 앱을 설치한 뒤 이 링크를 한 번 더 눌러 주세요");
    expect(buildInviteTicketMessage("ja", "L").split("\n")[0]).toContain("초대권");
    expect(buildInviteTicketMessage("en", "L", "ab3de").split("\n")).toHaveLength(3);
    expect(buildInviteTicketMessage("fr", "L", "ab3de").split("\n")).toHaveLength(5);
  });

  it("puts the code and the reopen note under every shared link, in every locale", () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      expect(resolveInviteTicketCopy(locale).codeLine, locale).toContain("{code}");
      const lines = buildInviteSharedLinkMessage(locale, "https://x.test/u/1", "ab3de").split("\n");
      expect(lines[0]).toBe("https://x.test/u/1");
      expect(lines.slice(1).every((line) => line.includes("ab3de")), locale).toBe(true);
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
