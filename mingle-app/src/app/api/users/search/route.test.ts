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
    });
    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        AND: [
          { id: { not: "user_123" } },
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
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        handle: true,
        name: true,
        image: true,
        imageCropScale: true,
        imageCropX: true,
        imageCropY: true,
        followerRelations: {
          where: { followerId: "user_123" },
          select: { followerId: true },
          take: 1,
        },
      },
    });
  });
});
