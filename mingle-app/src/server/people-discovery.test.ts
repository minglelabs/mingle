import { describe, expect, it } from "vitest";
import {
  buildPeopleDiscoverySql,
  decodePeopleDiscoveryCursor,
  encodePeopleDiscoveryCursor,
  resolveDiscoveryBadge,
  resolveIsKoreanSide,
  resolveViewerIsKorean,
} from "./people-discovery";

describe("people-discovery", () => {
  it("treats KR nationality or spoken Korean as the Korean side", () => {
    expect(resolveIsKoreanSide({ nationalityCountry: "kr" })).toBe(true);
    expect(resolveIsKoreanSide({ nationality: "ko" })).toBe(true);
    expect(resolveIsKoreanSide({ nationalityCountry: "US", primaryLanguages: ["en", "ko"] })).toBe(true);
    expect(resolveIsKoreanSide({ nationalityCountry: "JP", primaryLanguages: ["ja"] })).toBe(false);
    expect(resolveIsKoreanSide({ primaryLanguages: [] })).toBeNull();
  });

  it("falls back to the UI locale only when the viewer profile says nothing", () => {
    expect(resolveViewerIsKorean({ primaryLanguages: [] }, "ko")).toBe(true);
    expect(resolveViewerIsKorean(null, "en")).toBe(false);
    expect(resolveViewerIsKorean({ primaryLanguages: ["en"] }, "ko")).toBe(false);
  });

  it("round-trips the cursor and rejects bad ones", () => {
    const cursor = { tier: 2, lastSeenAt: new Date("2026-11-01T00:00:00.000Z"), id: "u1" };
    expect(decodePeopleDiscoveryCursor(encodePeopleDiscoveryCursor(cursor))).toEqual(cursor);
    expect(decodePeopleDiscoveryCursor(null)).toBeNull();
    expect(decodePeopleDiscoveryCursor("nope")).toBe("invalid");
    expect(decodePeopleDiscoveryCursor("x".repeat(600))).toBe("invalid");
    const outOfRange = Buffer.from(JSON.stringify({ tier: 4, lastSeenAt: cursor.lastSeenAt.toISOString(), id: "u1" })).toString("base64url");
    expect(decodePeopleDiscoveryCursor(outOfRange)).toBe("invalid");
  });

  it("excludes the viewer, inactive, deleted, hidden, restricted, anon/reserved and blocked users", () => {
    const sql = buildPeopleDiscoverySql({ viewerId: "viewer", viewerIsKorean: false, cursor: null, take: 21 });
    const text = sql.sql.replace(/\s+/g, " ");
    expect(text).toContain("u.is_active = true");
    expect(text).toContain("u.is_deleted = false");
    expect(text).toContain("u.moderation_hidden_at IS NULL");
    expect(text).toContain("u.moderation_restricted_at IS NULL");
    expect(text).toContain("u.id <> ?");
    expect(text).toContain("b.blocker_id = u.id AND b.blocked_id = ?");
    expect(text).toContain("b.blocker_id = ? AND b.blocked_id = u.id");
    expect(text).toContain("ORDER BY ranked.tier ASC, ranked.last_seen_at DESC, ranked.id DESC LIMIT");
    expect(sql.values).toEqual(expect.arrayContaining(["viewer", "anon_", "admin", 21]));
    expect(text).not.toContain("ranked.tier >");
  });

  it("ranks the other side first: Koreans for a foreigner, foreigners for a Korean", () => {
    const foreign = buildPeopleDiscoverySql({ viewerId: "v", viewerIsKorean: false, cursor: null, take: 5 }).sql;
    const korean = buildPeopleDiscoverySql({ viewerId: "v", viewerIsKorean: true, cursor: null, take: 5 }).sql;
    expect(foreign.replace(/\s+/g, " ")).toMatch(/ko' = ANY\(u\.primary_languages\) \) THEN 0 ELSE 2 END/);
    expect(korean.replace(/\s+/g, " ")).toMatch(/ko' = ANY\(u\.primary_languages\) \) THEN 2 ELSE 0 END/);
  });

  it("continues from a keyset cursor", () => {
    const lastSeenAt = new Date("2026-11-01T00:00:00.000Z");
    const sql = buildPeopleDiscoverySql({ viewerId: "v", viewerIsKorean: false, cursor: { tier: 1, lastSeenAt, id: "u9" }, take: 21 });
    expect(sql.sql).toContain("ranked.tier >");
    expect(sql.values).toEqual(expect.arrayContaining([1, lastSeenAt.toISOString(), "u9"]));
  });

  it("badges new users (7 days) before recently active ones (24 hours)", () => {
    const now = new Date("2026-11-14T12:00:00.000Z");
    const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
    expect(resolveDiscoveryBadge({ createdAt: hoursAgo(24 * 3), lastSeenAt: hoursAgo(1) }, now)).toBe("new");
    expect(resolveDiscoveryBadge({ createdAt: hoursAgo(24 * 30), lastSeenAt: hoursAgo(2) }, now)).toBe("active");
    expect(resolveDiscoveryBadge({ createdAt: hoursAgo(24 * 30), lastSeenAt: hoursAgo(48) }, now)).toBeNull();
  });
});
