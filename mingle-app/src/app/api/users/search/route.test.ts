import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindMany,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
    user: {
      findMany: mockUserFindMany,
    },
  },
}));

import { GET } from "@/app/api/users/search/route";

describe("/api/users/search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
  });

  it("returns unauthorized for unauthenticated searches", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET(new NextRequest("https://example.com/api/users/search?q=mina"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("does not query the database for an empty search", async () => {
    const response = await GET(new NextRequest("https://example.com/api/users/search?q=%20%20"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ users: [] });
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("does not query the database when an at-sign has no handle", async () => {
    const response = await GET(new NextRequest("https://example.com/api/users/search?q=%40"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ users: [] });
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("excludes the viewer, anon_ and reserved handles, and blocks in both directions in SQL", async () => {
    mockQueryRaw.mockResolvedValue([
      { id: "user_456", tier: 0, updatedAt: new Date("2026-09-09T00:00:00.000Z") },
    ]);
    mockUserFindMany.mockResolvedValue([
      { id: "user_456", handle: "mina.song", name: "Mina", image: null, followerRelations: [{ followerId: "user_123" }] },
    ]);

    const response = await GET(new NextRequest("https://example.com/api/users/search?q=%20Mina%20"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      users: [{ id: "user_456", handle: "mina.song", name: "Mina", image: null, isFollowing: true }],
      nextCursor: null,
    });
    const sql = mockQueryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain("u.is_active = true");
    expect(sql.sql).toContain("u.id <> ?");
    expect(sql.sql).toMatch(/left\(lower\(u\.handle\)/);
    expect(sql.sql).toContain("b.blocker_id = u.id AND b.blocked_id =");
    expect(sql.sql).toContain("b.blocked_id = u.id");
    expect(sql.values).toEqual(expect.arrayContaining(["user_123", "anon_", "admin", "%Mina%"]));
    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["user_456"] } },
      select: {
        id: true,
        handle: true,
        name: true,
        image: true,
        imageCropScale: true,
        imageCropX: true,
        imageCropY: true,
        isOfficial: true,
        followerRelations: { where: { followerId: "user_123" }, select: { followerId: true }, take: 1 },
      },
    });
  });

  it("marks only official accounts with isOfficial in the result rows", async () => {
    mockQueryRaw.mockResolvedValue([
      { id: "official", tier: 0, updatedAt: new Date("2026-09-09T00:00:00.000Z") },
      { id: "member", tier: 1, updatedAt: new Date("2026-09-08T00:00:00.000Z") },
    ]);
    mockUserFindMany.mockResolvedValue([
      { id: "official", handle: "mingle", name: "Mingle", image: null, isOfficial: true, followerRelations: [] },
      { id: "member", handle: "mingle.fan", name: "Fan", image: null, isOfficial: false, followerRelations: [] },
    ]);

    const payload = await (await GET(new NextRequest("https://example.com/api/users/search?q=mingle"))).json();

    expect(payload.users[0]).toMatchObject({ id: "official", isOfficial: true });
    expect(payload.users[1]).not.toHaveProperty("isOfficial");
  });

  it("orders by tier then recency across the whole match set, in SQL", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await GET(new NextRequest("https://example.com/api/users/search?q=mina"));
    const sql = mockQueryRaw.mock.calls[0][0] as { sql: string };
    expect(sql.sql.replace(/\s+/g, " ")).toContain(
      "ORDER BY ranked.tier ASC, ranked.updated_at DESC, ranked.id DESC LIMIT",
    );
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("keeps the SQL rank order even when the detail read returns rows shuffled", async () => {
    const at = new Date("2026-09-09T00:00:00.000Z");
    mockQueryRaw.mockResolvedValue([
      { id: "exact", tier: 0, updatedAt: at },
      { id: "prefix", tier: 1, updatedAt: at },
      { id: "contains", tier: 2, updatedAt: at },
    ]);
    mockUserFindMany.mockResolvedValue([
      { id: "contains", handle: "amina", name: null, image: null, followerRelations: [] },
      { id: "exact", handle: "mina", name: null, image: null, followerRelations: [] },
      { id: "prefix", handle: "mina.song", name: null, image: null, followerRelations: [] },
    ]);

    const payload = await (await GET(new NextRequest("https://example.com/api/users/search?q=mina"))).json();
    expect(payload.users.map((user: { id: string }) => user.id)).toEqual(["exact", "prefix", "contains"]);
  });

  it("returns a tier-aware keyset cursor and continues from it on the next page", async () => {
    const updatedAt = new Date("2026-09-09T00:00:00.000Z");
    mockQueryRaw.mockResolvedValueOnce(Array.from({ length: 21 }, (_, index) => ({
      id: `user_${index + 1}`,
      tier: index < 2 ? 0 : 2,
      updatedAt: new Date(updatedAt.getTime() - index * 1_000),
    })));
    mockUserFindMany.mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => ({
      id: `user_${index + 1}`, handle: `mina-${index + 1}`, name: null, image: null, followerRelations: [],
    })));

    const first = await (await GET(new NextRequest("https://example.com/api/users/search?q=mina"))).json();
    expect(first.users).toHaveLength(20);
    expect(first.users.at(-1)).toMatchObject({ id: "user_20" });
    const decoded = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8"));
    expect(decoded).toEqual({ tier: 2, updatedAt: new Date(updatedAt.getTime() - 19_000).toISOString(), id: "user_20" });

    mockQueryRaw.mockResolvedValueOnce([]);
    const second = await GET(new NextRequest(`https://example.com/api/users/search?q=mina&cursor=${first.nextCursor}`));
    expect(second.status).toBe(200);
    const sql = mockQueryRaw.mock.calls[1][0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain("ranked.tier >");
    expect(sql.values).toEqual(expect.arrayContaining([2, decoded.updatedAt, "user_20"]));
  });

  it("rejects malformed and pre-tier cursors before querying the database", async () => {
    const legacy = Buffer.from(JSON.stringify({ updatedAt: "2026-09-08T23:59:00.000Z", id: "user_020" }), "utf8")
      .toString("base64url");
    for (const cursor of ["not-a-cursor", legacy]) {
      const response = await GET(new NextRequest(`https://example.com/api/users/search?q=mina&cursor=${cursor}`));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_cursor" });
    }
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});
