import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import {
  INVITE_TICKET_COPY_LOCALES,
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
    const fromKorean = buildInviteTicketMessage("ko", "https://x.test/i/ab3de").split("\n");
    expect(fromKorean).toHaveLength(3);
    expect(fromKorean[0]).toContain("招待券");
    expect(fromKorean[1]).toContain("초대권");
    expect(fromKorean[2]).toBe("https://x.test/i/ab3de");
    expect(buildInviteTicketMessage("ja", "L").split("\n")[0]).toContain("초대권");
    expect(buildInviteTicketMessage("en", "L").split("\n")).toHaveLength(2);
    expect(buildInviteTicketMessage("fr", "L").split("\n")).toHaveLength(3);
  });

  it("picks the landing language from the browser, Japanese when unknown", () => {
    expect(resolveInviteLandingLocale("ja-JP,ja;q=0.9,en;q=0.8")).toBe("ja");
    expect(resolveInviteLandingLocale("en;q=0.5,ko-KR;q=0.9")).toBe("ko");
    expect(resolveInviteLandingLocale("")).toBe("ja");
    expect(resolveInviteLandingLocale(null)).toBe("ja");
    expect(resolveInviteLandingLocale("xx-YY")).toBe("ja");
  });
});
