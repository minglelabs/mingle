import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userFollow: {
      findMany: mockFindMany,
    },
  },
}));

import { GET as getFollowers } from "@/app/api/profile/followers/route";
import { GET as getFollowing } from "@/app/api/profile/following/route";

describe("profile follow list routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "viewer_123" } });
  });

  it("returns unauthorized for signed-out users", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await getFollowers(new NextRequest("https://example.com/api/profile/followers"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns follower users and searches their names or handles", async () => {
    mockFindMany.mockResolvedValue([
      {
        follower: {
          id: "user_456",
          handle: "mina.song",
          name: "Mina",
          image: null,
        },
      },
    ]);

    const response = await getFollowers(new NextRequest("https://example.com/api/profile/followers?q=Mina"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      users: [{
        id: "user_456",
        handle: "mina.song",
        name: "Mina",
        image: null,
      }],
    });
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ followingId: "viewer_123" }),
    }));
  });

  it("returns following users and avoids a broad query for a lone at-sign", async () => {
    const emptyResponse = await getFollowing(new NextRequest("https://example.com/api/profile/following?q=%40"));

    expect(emptyResponse.status).toBe(200);
    expect(await emptyResponse.json()).toEqual({ users: [] });
    expect(mockFindMany).not.toHaveBeenCalled();

    mockFindMany.mockResolvedValue([
      {
        following: {
          id: "user_789",
          handle: "alex",
          name: "Alex",
          image: "https://example.com/alex.png",
        },
      },
    ]);

    const response = await getFollowing(new NextRequest("https://example.com/api/profile/following?q=alex"));

    expect(await response.json()).toEqual({
      users: [{
        id: "user_789",
        handle: "alex",
        name: "Alex",
        image: "https://example.com/alex.png",
      }],
    });
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ followerId: "viewer_123" }),
    }));
  });
});
