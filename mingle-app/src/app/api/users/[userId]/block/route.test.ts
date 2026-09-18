import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockUserBlockUpsert,
  mockUserBlockDeleteMany,
  mockUserFollowDeleteMany,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserBlockUpsert: vi.fn(),
  mockUserBlockDeleteMany: vi.fn(),
  mockUserFollowDeleteMany: vi.fn(),
  mockTransaction: vi.fn(),
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
    userBlock: {
      upsert: mockUserBlockUpsert,
      deleteMany: mockUserBlockDeleteMany,
    },
    userFollow: { deleteMany: mockUserFollowDeleteMany },
    $transaction: mockTransaction,
  },
}));

import { DELETE, POST } from "@/app/api/users/[userId]/block/route";

describe("/api/users/[userId]/block route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
    mockUserFindUnique.mockResolvedValue({ id: "user_456" });
    mockUserBlockUpsert.mockResolvedValue({ id: "block_123" });
    mockUserBlockDeleteMany.mockResolvedValue({ count: 1 });
    mockUserFollowDeleteMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockResolvedValue([]);
  });

  it("creates a block and removes both follow directions", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/users/user_456/block", { method: "POST" }),
      { params: Promise.resolve({ userId: "user_456" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ isBlocked: true });
    expect(mockUserBlockUpsert).toHaveBeenCalledWith({
      where: {
        blockerId_blockedId: {
          blockerId: "user_123",
          blockedId: "user_456",
        },
      },
      create: { blockerId: "user_123", blockedId: "user_456" },
      update: {},
    });
    expect(mockUserFollowDeleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { followerId: "user_123", followingId: "user_456" },
          { followerId: "user_456", followingId: "user_123" },
        ],
      },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("removes a block for the signed-in user", async () => {
    const response = await DELETE(
      new NextRequest("https://example.com/api/users/user_456/block", { method: "DELETE" }),
      { params: Promise.resolve({ userId: "user_456" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ isBlocked: false });
    expect(mockUserBlockDeleteMany).toHaveBeenCalledWith({
      where: { blockerId: "user_123", blockedId: "user_456" },
    });
  });

  it("rejects blocking the current user", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/users/user_123/block", { method: "POST" }),
      { params: Promise.resolve({ userId: "user_123" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "cannot_block_self" });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockUserBlockUpsert).not.toHaveBeenCalled();
  });

  it("returns unauthorized without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest("https://example.com/api/users/user_456/block", { method: "DELETE" }),
      { params: Promise.resolve({ userId: "user_456" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mockUserBlockDeleteMany).not.toHaveBeenCalled();
  });
});
