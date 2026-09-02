import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockUserBlockFindFirst,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserBlockFindFirst: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    userBlock: { findFirst: mockUserBlockFindFirst },
  },
}));

import { GET } from "@/app/api/users/[userId]/route";

describe("/api/users/[userId] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "viewer_123" } });
    mockUserBlockFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({
      id: "user_456",
      handle: "mina.song",
      image: null,
      name: "미나",
      bio: "Hello",
      nationality: "ko",
      primaryLanguages: ["ko"],
      _count: { followerRelations: 4, followingRelations: 2 },
      followerRelations: [{ followerId: "viewer_123" }],
    });
  });

  it("resolves a public profile by handle while keeping the internal id private", async () => {
    mockUserFindUnique.mockReset();
    mockUserFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "user_456",
        handle: "mina.song",
        image: null,
        name: "미나",
        bio: "Hello",
        nationality: "ko",
        primaryLanguages: ["ko"],
        _count: { followerRelations: 4, followingRelations: 2 },
        followerRelations: [{ followerId: "viewer_123" }],
      });

    const response = await GET(new NextRequest("https://example.com/ko/users/@Mina.Song"), {
      params: Promise.resolve({ userId: "@Mina.Song" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "user_456",
      handle: "mina.song",
      image: null,
      name: "미나",
      bio: "Hello",
      nationality: "ko",
      primaryLanguages: ["ko"],
      location: null,
      followersCount: 4,
      followingCount: 2,
      isFollowing: true,
      isBlocked: false,
    });
    expect(mockUserFindUnique).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: "@Mina.Song", isActive: true } }));
    expect(mockUserFindUnique).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { handle: "mina.song", isActive: true } }));
    expect(mockUserBlockFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { blockerId: "viewer_123", blockedId: "user_456" },
          { blockerId: "user_456", blockedId: "viewer_123" },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
  });

  it("continues to resolve legacy internal user IDs", async () => {
    const response = await GET(new NextRequest("https://example.com/ko/users/user_456"), {
      params: Promise.resolve({ userId: "user_456" }),
    });

    expect(response.status).toBe(200);
    expect(mockUserFindUnique).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: "user_456", isActive: true } }));
    expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
  });
});
