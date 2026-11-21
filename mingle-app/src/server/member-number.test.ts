import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MEMBER_NUMBER_COPY_LOCALES, formatMemberNumber } from "@/i18n/member-number-copy";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import { hasMemberNumber, memberNumberWhere } from "./member-number";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// Owner request, 2026-11-21: show on every profile which member number the account joined as.
describe("member number", () => {
  it("counts members who joined no later than this account (id breaks a tie), never staff accounts", () => {
    const createdAt = new Date("2026-11-20T10:00:00Z");
    expect(memberNumberWhere({ id: "u5", createdAt })).toEqual({
      isOperator: false,
      isOfficial: false,
      OR: [
        { createdAt: { lt: createdAt } },
        { createdAt, id: { lte: "u5" } },
      ],
    });
    // Deleted, banned and merged accounts are not filtered out, so a given number never changes.
    expect(JSON.stringify(memberNumberWhere({ id: "u5", createdAt }))).not.toMatch(/isDeleted|bannedAt|mergedIntoUserId/);
  });

  it("gives no number to operator and official accounts", () => {
    expect(hasMemberNumber({ isOperator: true })).toBe(false);
    expect(hasMemberNumber({ isOfficial: true })).toBe(false);
    expect(hasMemberNumber({ isOperator: false, isOfficial: false })).toBe(true);
  });

  it("reads naturally in every app language, with grouped digits", () => {
    expect([...MEMBER_NUMBER_COPY_LOCALES].sort()).toEqual([...PRIMARY_UI_LOCALES].sort());
    expect(formatMemberNumber("ko", 1234)).toBe("해시챗 1,234번째 가입자");
    expect(formatMemberNumber("en", 1234)).toBe("HashChat member #1,234");
    expect(formatMemberNumber("ja", 7)).toBe("HashChat 7人目のメンバー");
    for (const locale of PRIMARY_UI_LOCALES) expect(formatMemberNumber(locale, 42), locale).toContain("42");
  });

  it("is on My page and on other people's profiles", () => {
    expect(read("./user-profile.ts")).toContain("getMemberNumber(profile)");
    expect(read("../app/api/users/[userId]/route.ts")).toContain("getMemberNumber(user)");
    expect(read("../components/my-page.tsx")).toContain("<MemberNumberLine memberNumber={profile.memberNumber} locale={locale} />");
    expect(read("../components/public-user-profile-screen.tsx")).toContain("<MemberNumberLine memberNumber={profile.memberNumber} locale={locale} />");
  });
});
