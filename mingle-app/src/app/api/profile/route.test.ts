import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockUserUpdate,
  mockResolveSupportedLocaleTag,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockResolveSupportedLocaleTag: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/i18n/config", () => ({
  resolveSupportedLocaleTag: mockResolveSupportedLocaleTag,
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
    mockResolveSupportedLocaleTag.mockImplementation((value: string) => value.trim());
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
      displayName: "Mingle Name",
      bio: "Hello",
      nationality: "ko",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "user_123",
      name: "Original Name",
      image: null,
      displayName: "Mingle Name",
      bio: "Hello",
      nationality: "ko",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user_123" },
      select: {
        id: true,
        name: true,
        image: true,
        displayName: true,
        bio: true,
        nationality: true,
      },
    });
  });

  it("normalizes and saves editable profile fields", async () => {
    mockResolveSupportedLocaleTag.mockReturnValue("ja");
    mockUserUpdate.mockResolvedValue({
      id: "user_123",
      name: "Original Name",
      image: null,
      displayName: "New Name",
      bio: "New bio",
      nationality: "ja",
    });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "  New Name ",
        bio: "  New bio ",
        nationality: " ja ",
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      displayName: "New Name",
      bio: "New bio",
      nationality: "ja",
    }));
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: {
        displayName: "New Name",
        bio: "New bio",
        nationality: "ja",
      },
      select: {
        id: true,
        name: true,
        image: true,
        displayName: true,
        bio: true,
        nationality: true,
      },
    });
  });

  it("rejects unsupported profile fields", async () => {
    mockResolveSupportedLocaleTag.mockReturnValue(null);

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ nationality: "not-a-locale" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_nationality" });
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
