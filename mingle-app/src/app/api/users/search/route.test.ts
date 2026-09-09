import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindMany: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
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
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("does not query the database for an empty search", async () => {
    const response = await GET(new NextRequest("https://example.com/api/users/search?q=%20%20"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ users: [] });
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("does not query the database when an at-sign has no handle", async () => {
    const response = await GET(new NextRequest("https://example.com/api/users/search?q=%40"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ users: [] });
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("searches handles and names while excluding the current user", async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: "user_456",
        handle: "mina.song",
        name: "Mina",
        image: null,
        followerRelations: [{ followerId: "user_123" }],
      },
    ]);

    const response = await GET(new NextRequest("https://example.com/api/users/search?q=%20Mina%20"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      users: [{
        id: "user_456",
        handle: "mina.song",
        name: "Mina",
        image: null,
        isFollowing: true,
      }],
      nextCursor: null,
    });
    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        AND: [
          { id: { not: "user_123" } },
          {
            NOT: {
              handle: { startsWith: "anon_", mode: "insensitive" },
            },
          },
          {
            NOT: {
              handle: { equals: "admin", mode: "insensitive" },
            },
          },
          { blockingRelations: { none: { blockedId: "user_123" } } },
          { blockedByRelations: { none: { blockerId: "user_123" } } },
          {
            OR: [
              { handle: { contains: "Mina", mode: "insensitive" } },
              { name: { contains: "Mina", mode: "insensitive" } },
            ],
          },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 21,
      select: {
        id: true,
        handle: true,
        name: true,
        image: true,
        imageCropScale: true,
        imageCropX: true,
        imageCropY: true,
        updatedAt: true,
        followerRelations: {
          where: { followerId: "user_123" },
          select: { followerId: true },
          take: 1,
        },
      },
    });
  });

  it("returns a cursor when another page is available", async () => {
    const updatedAt = new Date("2026-09-09T00:00:00.000Z");
    mockUserFindMany.mockResolvedValue(Array.from({ length: 21 }, (_, index) => ({
      id: `user_${index + 1}`,
      handle: `mina-${index + 1}`,
      name: `Mina ${index + 1}`,
      image: null,
      updatedAt: new Date(updatedAt.getTime() - index * 1_000),
      followerRelations: [],
    })));

    const response = await GET(new NextRequest("https://example.com/api/users/search?q=mina"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.users).toHaveLength(20);
    expect(payload.users.at(-1)).toMatchObject({ id: "user_20" });
    expect(payload.nextCursor).toEqual(expect.any(String));
    expect(mockUserFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));
  });

  it("uses the cursor as an exclusive updated-at and id boundary", async () => {
    const cursor = Buffer.from(JSON.stringify({
      updatedAt: "2026-09-08T23:59:00.000Z",
      id: "user_020",
    }), "utf8").toString("base64url");
    mockUserFindMany.mockResolvedValue([]);

    const response = await GET(new NextRequest(`https://example.com/api/users/search?q=mina&cursor=${cursor}`));

    expect(response.status).toBe(200);
    expect(mockUserFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{
          OR: [
            { updatedAt: { lt: new Date("2026-09-08T23:59:00.000Z") } },
            { updatedAt: new Date("2026-09-08T23:59:00.000Z"), id: { lt: "user_020" } },
          ],
        }]),
      }),
    }));
  });

  it("rejects malformed cursors before querying the database", async () => {
    const response = await GET(new NextRequest("https://example.com/api/users/search?q=mina&cursor=not-a-cursor"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_cursor" });
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });
});
