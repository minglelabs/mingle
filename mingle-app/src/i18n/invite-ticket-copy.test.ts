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

  it("writes the pasted message in four plain lines, in the sender's language", () => {
    expect(buildInviteTicketMessage("ko", "https://x.test/i/ab3de", "ab3de").split("\n")).toEqual([
      "해시챗 초대권",
      "초대코드 ab3de",
      "https://x.test/i/ab3de",
      "앱스토어(플레이스토어)에서 설치한 뒤 다시 링크를 눌러 들어가 보세요",
    ]);
    for (const locale of PRIMARY_UI_LOCALES) {
      const lines = buildInviteTicketMessage(locale, "L", "ab3de").split("\n");
      expect(lines, locale).toHaveLength(4);
      expect(lines[1], locale).toContain("ab3de");
      expect(lines[2], locale).toBe("L");
    }
    // Without a code the code line is left out.
    expect(buildInviteTicketMessage("en", "L").split("\n")).toHaveLength(3);
  });

  it("puts the code and the reopen note under every shared link, in every locale", () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      expect(resolveInviteTicketCopy(locale).codeLine, locale).toContain("{code}");
      const lines = buildInviteSharedLinkMessage(locale, "https://x.test/u/1", "ab3de").split("\n");
      expect(lines[0]).toBe("https://x.test/u/1");
      expect(lines[1], locale).toContain("ab3de");
      expect(lines, locale).toHaveLength(3);
    }
    // Without a code (signed out, offline) only the reopen note is added.
    expect(buildInviteSharedLinkMessage("en", "L", null)).toBe("L\nInstall it from the App Store (Google Play), then tap the link again");
  });

  it("picks the landing language from the browser, Japanese when unknown", () => {
    expect(resolveInviteLandingLocale("ja-JP,ja;q=0.9,en;q=0.8")).toBe("ja");
    expect(resolveInviteLandingLocale("en;q=0.5,ko-KR;q=0.9")).toBe("ko");
    expect(resolveInviteLandingLocale("")).toBe("ja");
    expect(resolveInviteLandingLocale(null)).toBe("ja");
    expect(resolveInviteLandingLocale("xx-YY")).toBe("ja");
  });
});
