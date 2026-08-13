import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockUserBlockFindFirst,
  mockUserFollowUpsert,
  mockUserFollowDeleteMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserBlockFindFirst: vi.fn(),
  mockUserFollowUpsert: vi.fn(),
  mockUserFollowDeleteMany: vi.fn(),
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
      findUnique: mockUserFindUnique,
    },
    userBlock: {
      findFirst: mockUserBlockFindFirst,
    },
    userFollow: {
      upsert: mockUserFollowUpsert,
      deleteMany: mockUserFollowDeleteMany,
    },
  },
}));

import { DELETE, POST } from "@/app/api/users/[userId]/follow/route";

describe("/api/users/[userId]/follow route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
    mockUserFindUnique.mockResolvedValue({ id: "user_456" });
    mockUserBlockFindFirst.mockResolvedValue(null);
  });

  it("creates an idempotent follow relation", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/users/user_456/follow", { method: "POST" }),
      { params: Promise.resolve({ userId: "user_456" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ isFollowing: true });
    expect(mockUserFollowUpsert).toHaveBeenCalledWith({
      where: {
        followerId_followingId: {
          followerId: "user_123",
          followingId: "user_456",
        },
      },
      create: { followerId: "user_123", followingId: "user_456" },
      update: {},
    });
  });

  it("removes a follow relation without failing when it is already absent", async () => {
    const response = await DELETE(
      new NextRequest("https://example.com/api/users/user_456/follow", { method: "DELETE" }),
      { params: Promise.resolve({ userId: "user_456" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ isFollowing: false });
    expect(mockUserFollowDeleteMany).toHaveBeenCalledWith({
      where: { followerId: "user_123", followingId: "user_456" },
    });
  });

  it("rejects self-following", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/users/user_123/follow", { method: "POST" }),
      { params: Promise.resolve({ userId: "user_123" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "cannot_follow_self" });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockUserFollowUpsert).not.toHaveBeenCalled();
  });

  it("returns not found when the target user does not exist", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("https://example.com/api/users/missing/follow", { method: "POST" }),
      { params: Promise.resolve({ userId: "missing" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "user_not_found" });
    expect(mockUserFollowUpsert).not.toHaveBeenCalled();
  });

  it("rejects following a user when either side has blocked the other", async () => {
    mockUserBlockFindFirst.mockResolvedValue({ id: "block_123" });

    const response = await POST(
      new NextRequest("https://example.com/api/users/user_456/follow", { method: "POST" }),
      { params: Promise.resolve({ userId: "user_456" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "user_blocked" });
    expect(mockUserFollowUpsert).not.toHaveBeenCalled();
  });
});
