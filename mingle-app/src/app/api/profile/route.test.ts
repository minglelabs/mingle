import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockUserUpdate,
  mockEnsureSignupWelcomeOnboarding,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockEnsureSignupWelcomeOnboarding: vi.fn(),
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

vi.mock("@/lib/signup-welcome-onboarding", () => ({
  ensureSignupWelcomeOnboarding: mockEnsureSignupWelcomeOnboarding,
}));

import { GET, PATCH } from "@/app/api/profile/route";

describe("/api/profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
    // Fresh account with no persisted language preference yet — the
    // baseline most tests want for the existingPreference/privateFields
    // lookups; tests that care about a different prior state override this
    // explicitly.
    mockUserFindUnique.mockResolvedValue({
      defaultDisplayLanguage: null,
      defaultConversationLanguages: [],
      birthDate: null,
    });
  });

  it("returns unauthorized for unauthenticated profile reads", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("rejects a pending language edit from the previous account before touching the new profile", async () => {
    const response = await PATCH(new NextRequest("https://mingle.example/api/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json", "x-mingle-expected-account-id": "previous_user" },
      body: JSON.stringify({ defaultConversationLanguages: ["ko"] }),
    }));
    expect(response.status).toBe(401);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's profile", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "user_123",
      name: "Mingle Name",
      image: null,
      handle: "original.name",
      bio: "Hello",
      nationality: "ko",
      primaryLanguages: [],
      defaultConversationLanguages: [],
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
      primaryLanguages: ["ko"],
      defaultConversationLanguages: [],
      location: null,
      birthDate: null,
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
        primaryLanguages: true,
        defaultConversationLanguages: true,
        locationLatitude: true,
        locationLongitude: true,
        locationCity: true,
        locationCountry: true,
        locationCountryCode: true,
        _count: {
          select: {
            followerRelations: {
              where: { follower: { isActive: true } },
            },
            followingRelations: {
              where: { following: { isActive: true } },
            },
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
      primaryLanguages: [],
      defaultConversationLanguages: [],
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
        primaryLanguages: ["ja"],
        defaultDisplayLanguage: "ja",
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
        primaryLanguages: true,
        defaultConversationLanguages: true,
        locationLatitude: true,
        locationLongitude: true,
        locationCity: true,
        locationCountry: true,
        locationCountryCode: true,
        _count: {
          select: {
            followerRelations: {
              where: { follower: { isActive: true } },
            },
            followingRelations: {
              where: { following: { isActive: true } },
            },
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
    mockUserUpdate.mockRejectedValue({ code: "P2002", meta: { target: ["handle"] } });

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
      primaryLanguages: [],
      defaultConversationLanguages: [],
      _count: { followerRelations: 0, followingRelations: 0 },
    });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nationality: " cy " }),
    }));

    expect(response.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { nationality: "cy", primaryLanguages: ["cy"], defaultDisplayLanguage: "cy" },
    }));
  });

  it("preserves the selected order for primary and default conversation languages", async () => {
    mockUserUpdate.mockResolvedValue({
      id: "user_123",
      name: null,
      image: null,
      handle: null,
      bio: null,
      nationality: "ja",
      primaryLanguages: ["ja", "en", "ko", "fr"],
      defaultConversationLanguages: ["ja", "en", "ko"],
      _count: { followerRelations: 0, followingRelations: 0 },
    });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryLanguages: ["ja", "en", "ko", "fr"],
        defaultConversationLanguages: ["ja", "en", "ko"],
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      nationality: "ja",
      primaryLanguages: ["ja", "en", "ko", "fr"],
      defaultConversationLanguages: ["ja", "en", "ko"],
    }));
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        primaryLanguages: ["ja", "en", "ko", "fr"],
        nationality: "ja",
        defaultConversationLanguages: ["ja", "en", "ko"],
        defaultDisplayLanguage: "ja",
      },
    }));
  });

  it("refreshes Royce's welcome message the first time defaultConversationLanguages is set (OAuth's post-login sync)", async () => {
    // OAuth signup creates the welcome message with a hardcoded "en" locale
    // before this route ever runs (see auth-options.ts). The client's
    // post-login reconciliation is what first PATCHes the language the user
    // actually picked in the pre-login onboarding screen, so this empty ->
    // non-empty transition is the one moment that should redo it.
    mockUserFindUnique.mockResolvedValue({
      defaultDisplayLanguage: null,
      defaultConversationLanguages: [],
      birthDate: null,
    });
    mockUserUpdate.mockResolvedValue({
      id: "user_123",
      name: null,
      image: null,
      handle: null,
      bio: null,
      nationality: "it",
      primaryLanguages: ["it"],
      defaultConversationLanguages: ["it", "en", "ko"],
      _count: { followerRelations: 0, followingRelations: 0 },
    });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryLanguages: ["it"],
        defaultConversationLanguages: ["it", "en", "ko"],
      }),
    }));

    expect(response.status).toBe(200);
    expect(mockEnsureSignupWelcomeOnboarding).toHaveBeenCalledWith({
      userId: "user_123",
      locale: "it",
    });
  });

  it("does not resend the welcome message when the language is merely changed later", async () => {
    mockUserFindUnique.mockResolvedValue({
      defaultDisplayLanguage: "it",
      defaultConversationLanguages: ["it", "en", "ko"],
      birthDate: null,
    });
    mockUserUpdate.mockResolvedValue({
      id: "user_123",
      name: null,
      image: null,
      handle: null,
      bio: null,
      nationality: "fr",
      primaryLanguages: ["fr"],
      defaultConversationLanguages: ["fr", "en", "ko"],
      _count: { followerRelations: 0, followingRelations: 0 },
    });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryLanguages: ["fr"],
        defaultConversationLanguages: ["fr", "en", "ko"],
      }),
    }));

    expect(response.status).toBe(200);
    expect(mockEnsureSignupWelcomeOnboarding).not.toHaveBeenCalled();
  });

  it("updates birthDate when valid and old enough", async () => {
    mockUserUpdate.mockResolvedValue({
      id: "user_123",
      name: null,
      image: null,
      handle: null,
      bio: null,
      nationality: null,
      primaryLanguages: [],
      defaultConversationLanguages: [],
      _count: { followerRelations: 0, followingRelations: 0 },
    });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        birthDate: "1995-05-20",
      }),
    }));

    expect(response.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        birthDate: new Date("1995-05-20T00:00:00.000Z"),
      },
    }));
  });

  it("rejects birthDate when underage or invalid", async () => {
    const invalidResponse = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        birthDate: "invalid-date",
      }),
    }));
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toEqual({ error: "invalid_birth_date" });

    const underageResponse = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        birthDate: "2025-01-01",
      }),
    }));
    expect(underageResponse.status).toBe(400);
    expect(await underageResponse.json()).toEqual({ error: "minimum_age_required" });
  });

  it("rounds and saves a city-level location after permission is granted", async () => {
    mockUserUpdate.mockResolvedValue({
      id: "user_123",
      name: null,
      image: null,
      handle: "mingle.user",
      bio: null,
      nationality: null,
      primaryLanguages: [],
      defaultConversationLanguages: [],
      locationLatitude: 37.57,
      locationLongitude: 126.98,
      locationCity: "서울",
      locationCountry: "대한민국",
      locationCountryCode: "kr",
      _count: { followerRelations: 0, followingRelations: 0 },
    });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: {
          latitude: 37.566826,
          longitude: 126.978656,
          city: " 서울 ",
          country: " 대한민국 ",
          countryCode: "KR",
        },
        locationPermissionStatus: "granted",
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      location: {
        latitude: 37.57,
        longitude: 126.98,
        city: "서울",
        country: "대한민국",
        countryCode: "kr",
      },
    }));
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        locationLatitude: 37.57,
        locationLongitude: 126.98,
        locationCity: "서울",
        locationCountry: "대한민국",
        locationCountryCode: "kr",
        locationUpdatedAt: expect.any(Date),
        locationPermissionVerifiedAt: expect.any(Date),
      }),
    }));
  });

  it("clears a stored location when the permission is no longer granted", async () => {
    mockUserUpdate.mockResolvedValue({
      id: "user_123",
      name: null,
      image: null,
      handle: "mingle.user",
      bio: null,
      nationality: null,
      primaryLanguages: [],
      defaultConversationLanguages: [],
      locationLatitude: null,
      locationLongitude: null,
      locationCity: null,
      locationCountry: null,
      locationCountryCode: null,
      _count: { followerRelations: 0, followingRelations: 0 },
    });

    const response = await PATCH(new NextRequest("https://example.com/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationPermissionStatus: "blocked" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ location: null }));
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        locationLatitude: null,
        locationLongitude: null,
        locationCity: null,
        locationCountry: null,
        locationCountryCode: null,
        locationUpdatedAt: null,
        locationPermissionVerifiedAt: null,
      },
    }));
  });
});
