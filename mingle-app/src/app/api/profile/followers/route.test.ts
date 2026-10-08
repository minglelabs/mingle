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
import { USER_IDENTITY_SELECT } from "@/server/identity/user-identity-select";

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
        isFollowing: false,
        isFollowedBy: true,
      }],
    });
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ followingId: "viewer_123" }),
    }));
  });

  it("shows an operator in both lists like anyone else (asking the DB for the badge flags)", async () => {
    const operator = {
      id: "op", handle: "mingle.mina", name: "Mina", image: null,
      imageCropScale: 1, imageCropX: 0, imageCropY: 0, isOfficial: false, isOperator: true,
    };
    const member = {
      id: "member", handle: "fan", name: "Fan", image: null,
      imageCropScale: 1, imageCropX: 0, imageCropY: 0, isOfficial: false, isOperator: false,
    };
    mockFindMany.mockResolvedValueOnce([{ follower: operator }, { follower: member }]).mockResolvedValueOnce([]);
    const followers = await (await getFollowers(new NextRequest("https://example.com/api/profile/followers"))).json();
    expect(followers.users).toEqual([
      { id: "op", handle: "mingle.mina", name: "Mina", image: null, isFollowing: false, isFollowedBy: true },
      { id: "member", handle: "fan", name: "Fan", image: null, isFollowing: false, isFollowedBy: true },
    ]);
    expect(mockFindMany.mock.calls[0][0].select).toEqual({ follower: { select: USER_IDENTITY_SELECT } });

    mockFindMany.mockReset();
    mockFindMany.mockResolvedValueOnce([{ following: operator }]).mockResolvedValueOnce([]);
    const following = await (await getFollowing(new NextRequest("https://example.com/api/profile/following"))).json();
    expect(following.users).toEqual([
      { id: "op", handle: "mingle.mina", name: "Mina", image: null, isFollowing: true, isFollowedBy: false },
    ]);
    expect(mockFindMany.mock.calls[0][0].select).toEqual({ following: { select: USER_IDENTITY_SELECT } });
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
        isFollowing: true,
        isFollowedBy: false,
      }],
    });
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ followerId: "viewer_123" }),
    }));
  });
});
