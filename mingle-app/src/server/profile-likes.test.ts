import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProfileLikesCopy } from "@/i18n/profile-likes-copy";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import { parseDiscoveryPage } from "@/components/search/people-discovery-state";
import { isNewDiscoveryUser, resolveDiscoveryActivityBadge } from "@/server/people-discovery";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("hearts on a profile", () => {
  it("is one row per pair, in a table of its own", () => {
    const sql = read("prisma/migrations/20261125190000_add_profile_likes/migration.sql");
    expect(sql).toContain('CREATE TABLE "app"."app_profile_likes"');
    expect(sql).toContain('PRIMARY KEY ("liker_id","liked_id")');
  });

  it("never hearts oneself, a hidden account, or across a block", () => {
    const server = read("src/server/profile-likes.ts");
    expect(server).toContain('if (likerId === likedId) return { ok: false, error: "self" };');
    expect(server).toContain("...accountShownInAppWhere()");
    expect(server).toContain('if (block) return { ok: false, error: "blocked" };');
    // The list on My page leaves out blocked people either way.
    expect(server).toContain("blockedByRelations: { none: { blockerId: userId } },");
  });

  it("has a heart button on the profile and a pill on My page, in every app language", () => {
    const profile = read("src/components/public-user-profile-screen.tsx");
    expect(profile).toContain('data-qa="profile-like"');
    expect(profile).toContain('{ method: next ? "POST" : "DELETE" }');
    expect(read("src/components/my-page.tsx")).toContain("<ProfileLikesPill locale={locale} />");
    // Nothing on My page while there are no hearts.
    expect(read("src/components/profile-likes-pill.tsx")).toContain("if (!people || people.length === 0) return null;");
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolveProfileLikesCopy(locale);
      for (const text of [copy.send, copy.sent, copy.listTitle, copy.failed, copy.close]) expect(text.length).toBeGreaterThan(0);
    }
  });

  it("is served under the app's versioned addresses too", () => {
    for (const platform of ["ios", "android"]) {
      expect(read(`src/app/api/${platform}/v2.2.0/users/[userId]/like/route.ts`)).toContain('export { GET, POST, DELETE } from "@/app/api/users/[userId]/like/route";');
      expect(read(`src/app/api/${platform}/v2.2.0/profile/likes/route.ts`)).toContain('export { GET } from "@/app/api/profile/likes/route";');
    }
  });
});

describe("the new tag on explore cards", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const DAY = 24 * 60 * 60 * 1000;

  it("is a tag of its own, shown together with the activity badge", () => {
    expect(isNewDiscoveryUser({ createdAt: ago(2 * DAY) }, now)).toBe(true);
    expect(isNewDiscoveryUser({ createdAt: ago(8 * DAY) }, now)).toBe(false);
    // A new person who is online now shows both.
    expect(resolveDiscoveryActivityBadge({ lastSeenAt: ago(60_000) }, now)).toBe("online");
    expect(resolveDiscoveryActivityBadge({ lastSeenAt: ago(3 * 60 * 60 * 1000) }, now)).toBe("active");
    expect(resolveDiscoveryActivityBadge({ lastSeenAt: ago(3 * DAY) }, now)).toBeNull();
    const page = parseDiscoveryPage({ users: [{ id: "a", isNew: true, badge: "online" }, { id: "b" }], nextCursor: null });
    expect(page.users[0]).toMatchObject({ isNew: true, badge: "online" });
    expect(page.users[1]?.isNew).toBeUndefined();
    const card = read("src/components/explore/explore-people-page.tsx");
    expect(card).toContain('data-qa="explore-new-tag"');
    expect(card).toContain("{person.isNew || activityLabel ? (");
  });
});
