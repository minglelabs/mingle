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
      name: "Mingle Name",
      image: null,
      handle: "original.name",
      bio: "Hello",
      nationality: "ko",
      _count: { followerRelations: 2, followingRelations: 3 },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "user_123",
      name: "Mingle Name",
      image: null,
      handle: "original.name",
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
        image: true,
        imageObjectKey: true,
        imageCropScale: true,
        imageCropX: true,
        imageCropY: true,
        handle: true,
        name: true,
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
      name: "New Name",
      image: null,
      handle: "new.name",
      bio: "New bio",
      nationality: "ja",
      _count: { followerRelations: 1, followingRelations: 4 },
    });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: "  New.Name ",
        name: "  New Name ",
        bio: "  New bio ",
        nationality: " ja ",
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      name: "New Name",
      handle: "new.name",
      bio: "New bio",
      nationality: "ja",
    }));
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: {
        handle: "new.name",
        name: "New Name",
        bio: "New bio",
        nationality: "ja",
      },
      select: {
        id: true,
        image: true,
        imageObjectKey: true,
        imageCropScale: true,
        imageCropX: true,
        imageCropY: true,
        handle: true,
        name: true,
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

  it("rejects handles with unsupported characters", async () => {
    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ handle: "name-with-dash" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_handle" });
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns a conflict when a handle is already in use", async () => {
    mockUserUpdate.mockRejectedValue({ code: "P2002" });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ handle: "taken.name" }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "handle_taken" });
  });

  it("accepts an STT language outside the primary UI locale list", async () => {
    mockUserUpdate.mockResolvedValue({
      id: "user_123",
      name: null,
      image: null,
      handle: null,
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
