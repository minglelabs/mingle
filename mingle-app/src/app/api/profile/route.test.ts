import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockUserUpdate,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
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
      update: mockUserUpdate,
    },
  },
}));

import { GET, PATCH } from "@/app/api/profile/route";

describe("/api/profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
  });

  it("returns unauthorized for unauthenticated profile reads", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's profile", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "user_123",
      name: "Original Name",
      image: null,
      username: "original.name",
      displayName: "Mingle Name",
      bio: "Hello",
      nationality: "ko",
      _count: { followerRelations: 2, followingRelations: 3 },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "user_123",
      name: "Original Name",
      image: null,
      username: "original.name",
      displayName: "Mingle Name",
      bio: "Hello",
      nationality: "ko",
      followersCount: 2,
      followingCount: 3,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user_123" },
      select: {
        id: true,
        name: true,
        image: true,
        username: true,
        displayName: true,
        bio: true,
        nationality: true,
        _count: {
          select: {
            followerRelations: true,
            followingRelations: true,
          },
        },
      },
    });
  });

  it("normalizes and saves editable profile fields", async () => {
    mockUserUpdate.mockResolvedValue({
      id: "user_123",
      name: "Original Name",
      image: null,
      username: "new.name",
      displayName: "New Name",
      bio: "New bio",
      nationality: "ja",
      _count: { followerRelations: 1, followingRelations: 4 },
    });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "  New.Name ",
        displayName: "  New Name ",
        bio: "  New bio ",
        nationality: " ja ",
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      displayName: "New Name",
      username: "new.name",
      bio: "New bio",
      nationality: "ja",
    }));
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: {
        username: "new.name",
        displayName: "New Name",
        bio: "New bio",
        nationality: "ja",
      },
      select: {
        id: true,
        name: true,
        image: true,
        username: true,
        displayName: true,
        bio: true,
        nationality: true,
        _count: {
          select: {
            followerRelations: true,
            followingRelations: true,
          },
        },
      },
    });
  });

  it("rejects unsupported profile fields", async () => {
    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ nationality: "not-a-locale" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_nationality" });
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("rejects usernames with unsupported characters", async () => {
    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ username: "name-with-dash" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_username" });
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns a conflict when a username is already in use", async () => {
    mockUserUpdate.mockRejectedValue({ code: "P2002" });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ username: "taken.name" }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "username_taken" });
  });

  it("accepts an STT language outside the primary UI locale list", async () => {
    mockUserUpdate.mockResolvedValue({
      id: "user_123",
      name: "Original Name",
      image: null,
      username: null,
      displayName: null,
      bio: null,
      nationality: "cy",
      _count: { followerRelations: 0, followingRelations: 0 },
    });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nationality: " cy " }),
    }));

    expect(response.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { nationality: "cy" },
    }));
  });
});
