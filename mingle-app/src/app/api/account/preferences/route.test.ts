import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockUserUpdate,
  mockUserUpdateMany,
  mockAppEventLogFindFirst,
  mockAppMessageFindFirst,
  mockEnsureTrackingContext,
  mockParseClientContext,
  mockUpsertTrackedUser,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserUpdateMany: vi.fn(),
  mockAppEventLogFindFirst: vi.fn(),
  mockAppMessageFindFirst: vi.fn(),
  mockEnsureTrackingContext: vi.fn(),
  mockParseClientContext: vi.fn(),
  mockUpsertTrackedUser: vi.fn(),
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
      updateMany: mockUserUpdateMany,
    },
    appEventLog: {
      findFirst: mockAppEventLogFindFirst,
    },
    appMessage: {
      findFirst: mockAppMessageFindFirst,
    },
  },
}));

vi.mock("@/lib/app-analytics", () => ({
  ensureTrackingContext: mockEnsureTrackingContext,
  parseClientContext: mockParseClientContext,
  upsertTrackedUser: mockUpsertTrackedUser,
}));

import { GET, PATCH } from "@/app/api/account/preferences/route";

describe("/api/account/preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageFindFirst.mockResolvedValue(null);
    mockEnsureTrackingContext.mockReturnValue({
      externalUserId: "anon_seeded_user",
      sessionKey: "sess_seeded_user",
    });
    mockParseClientContext.mockImplementation((payload: Record<string, unknown> | undefined) => ({
      language: null,
      pageLanguage: null,
      referrer: null,
      fullUrl: null,
      queryParams: null,
      screenWidth: null,
      screenHeight: null,
      timezone: null,
      platform: null,
      clientPlatform: typeof payload?.clientPlatform === "string" ? payload.clientPlatform : null,
      apiNamespace: typeof payload?.apiNamespace === "string" ? payload.apiNamespace : null,
      pathname: null,
      appVersion: typeof payload?.appVersion === "string" ? payload.appVersion : null,
      usageSec: null,
    }));
    mockUserUpdate.mockResolvedValue({ id: "user_123" });
    mockUpsertTrackedUser.mockResolvedValue("seeded_user_id");
  });

  it("returns default preferences for fresh anonymous GET requests", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);

    const response = await GET(new NextRequest("https://example.com/api/account/preferences"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      textSizeLevel: 2,
      sonioxManualFinalizeSilenceMs: 500,
      translationModel: "gemini-2.5-flash-lite",
      adBannerPosition: null,
    });
    expect(mockUpsertTrackedUser).toHaveBeenCalled();
  });

  it("hydrates and seeds a fresh anonymous GET with the provided x-mingle-user-id", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockEnsureTrackingContext.mockImplementation((_request, _response, hints) => ({
      externalUserId: hints?.externalUserIdHint ?? "anon_seeded_user",
      sessionKey: hints?.sessionKeyHint ?? "sess_seeded_user",
    }));
    mockUserFindUnique.mockResolvedValue(null);

    const response = await GET(new NextRequest("https://example.com/api/account/preferences", {
      headers: {
        "x-mingle-user-id": "anon_local_storage_user",
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      textSizeLevel: 2,
      sonioxManualFinalizeSilenceMs: 500,
      translationModel: "gemini-2.5-flash-lite",
      adBannerPosition: null,
    });
    expect(mockEnsureTrackingContext).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.any(NextResponse),
      expect.objectContaining({
        externalUserIdHint: "anon_local_storage_user",
      }),
    );
    expect(mockUpsertTrackedUser).toHaveBeenCalledWith({
      tracking: {
        externalUserId: "anon_local_storage_user",
        sessionKey: "sess_seeded_user",
      },
      clientContext: {
        language: null,
        pageLanguage: null,
        referrer: null,
        fullUrl: null,
        queryParams: null,
        screenWidth: null,
        screenHeight: null,
        timezone: null,
        platform: null,
        clientPlatform: null,
        apiNamespace: null,
        pathname: null,
        appVersion: null,
        usageSec: null,
      },
    });
  });

  it("returns the stored DB-backed preferences for authenticated users", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user_123",
        email: "user@example.com",
      },
    });
    mockUserFindUnique.mockResolvedValue({
      demoTextSizeLevel: 4,
      demoSilenceFinalizeMs: 1000,
      translationModel: "qwen/qwen3.5-9b",
      adBannerPosition: "bottom",
    });

    const response = await GET(new NextRequest("https://example.com/api/account/preferences"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      textSizeLevel: 4,
      sonioxManualFinalizeSilenceMs: 1000,
      translationModel: "qwen/qwen3.5-9b",
      adBannerPosition: "bottom",
    });
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user_123" },
      select: {
        id: true,
        demoTextSizeLevel: true,
        demoSilenceFinalizeMs: true,
        translationModel: true,
        adBannerPosition: true,
      },
    });
  });

  it("syncs native app version history onto an existing user during GET", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user_123",
        email: "user@example.com",
      },
    });
    mockUserFindUnique
      .mockResolvedValueOnce({
        id: "user_123",
        demoTextSizeLevel: 4,
        demoSilenceFinalizeMs: 1000,
        translationModel: "qwen/qwen3.5-9b",
      })
      .mockResolvedValueOnce({
        id: "user_123",
        latestAppVersion: "1.0.5",
        latestApiNamespace: "ios/v1.0.5",
        latestClientPlatform: "ios",
        appVersionHistory: ["1.0.5"],
        apiNamespaceHistory: ["ios/v1.0.5"],
      });

    const response = await GET(new NextRequest("https://example.com/api/account/preferences", {
      headers: {
        "x-mingle-app-version": "1.0.9",
        "x-mingle-api-namespace": "ios/v1.0.9",
        "x-mingle-client-platform": "ios",
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      textSizeLevel: 4,
      sonioxManualFinalizeSilenceMs: 1000,
      translationModel: "qwen/qwen3.5-9b",
      adBannerPosition: null,
    });
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: {
        latestAppVersion: "1.0.9",
        latestApiNamespace: "ios/v1.0.9",
        appVersionHistory: ["1.0.5", "1.0.9"],
        apiNamespaceHistory: ["ios/v1.0.5", "ios/v1.0.9"],
      },
    });
  });

  it("falls back to the 500ms DB default when silence finalize is unset", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user_123",
        email: "user@example.com",
      },
    });
    mockUserFindUnique.mockResolvedValue({
      demoTextSizeLevel: null,
      demoSilenceFinalizeMs: null,
      translationModel: null,
      adBannerPosition: null,
    });

    const response = await GET(new NextRequest("https://example.com/api/account/preferences"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      textSizeLevel: 2,
      sonioxManualFinalizeSilenceMs: 500,
      translationModel: "gemini-2.5-flash-lite",
      adBannerPosition: null,
    });
  });

  it("clamps and persists silence finalize updates through PATCH", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user_123",
        email: "user@example.com",
      },
    });
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new NextRequest("https://example.com/api/account/preferences", {
      method: "PATCH",
      body: JSON.stringify({
        sonioxManualFinalizeSilenceMs: 99999,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: {
        demoSilenceFinalizeMs: 3000,
      },
    });
  });

  it("persists a supported translation model through PATCH", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user_123",
        email: "user@example.com",
      },
    });
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new NextRequest("https://example.com/api/account/preferences", {
      method: "PATCH",
      body: JSON.stringify({
        translationModel: "qwen/qwen3.5-9b",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: {
        translationModel: "qwen/qwen3.5-9b",
      },
    });
  });

  it("persists a supported ad banner position through PATCH", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user_123",
        email: "user@example.com",
      },
    });
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new NextRequest("https://example.com/api/account/preferences", {
      method: "PATCH",
      body: JSON.stringify({
        adBannerPosition: "bottom",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: {
        adBannerPosition: "bottom",
      },
    });
  });

  it("returns the stored DB-backed preferences for tracking users without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({
      demoTextSizeLevel: 3,
      demoSilenceFinalizeMs: 1500,
      translationModel: "qwen/qwen3.5-9b",
      adBannerPosition: "top",
    });

    const response = await GET(new NextRequest("https://example.com/api/account/preferences", {
      headers: {
        "x-mingle-user-id": "anon_test_user",
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      textSizeLevel: 3,
      sonioxManualFinalizeSilenceMs: 1500,
      translationModel: "qwen/qwen3.5-9b",
      adBannerPosition: "top",
    });
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { externalUserId: "anon_test_user" },
      select: {
        id: true,
        demoTextSizeLevel: true,
        demoSilenceFinalizeMs: true,
        translationModel: true,
        adBannerPosition: true,
      },
    });
  });

  it("persists a supported translation model for tracking users without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockUserUpdateMany.mockResolvedValue({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const response = await PATCH(new NextRequest("https://example.com/api/account/preferences", {
      method: "PATCH",
      headers: {
        "x-mingle-user-id": "anon_test_user",
      },
      body: JSON.stringify({
        translationModel: "qwen/qwen3.5-9b",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { externalUserId: "anon_test_user" },
      data: {
        translationModel: "qwen/qwen3.5-9b",
      },
    });
  });

  it("returns stored preferences by session key when tracking cookies are unavailable", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockEnsureTrackingContext.mockReturnValue({
      externalUserId: "",
      sessionKey: "sess_test_user",
    });
    mockAppEventLogFindFirst.mockResolvedValue({ userId: "user_from_session" });
    mockUserFindUnique.mockResolvedValue({
      demoTextSizeLevel: 3,
      demoSilenceFinalizeMs: 900,
      translationModel: "qwen/qwen3.5-9b",
      adBannerPosition: "bottom",
    });

    const response = await GET(new NextRequest("https://example.com/api/account/preferences", {
      headers: {
        "x-mingle-session-key": "sess_test_user",
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      textSizeLevel: 3,
      sonioxManualFinalizeSilenceMs: 900,
      translationModel: "qwen/qwen3.5-9b",
      adBannerPosition: "bottom",
    });
    expect(mockAppEventLogFindFirst).toHaveBeenCalledWith({
      where: {
        sessionKey: "sess_test_user",
        userId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { userId: true },
    });
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user_from_session" },
      select: {
        id: true,
        demoTextSizeLevel: true,
        demoSilenceFinalizeMs: true,
        translationModel: true,
        adBannerPosition: true,
      },
    });
  });

  it("persists translation model by session key when tracking cookies are unavailable", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockEnsureTrackingContext.mockReturnValue({
      externalUserId: "",
      sessionKey: "sess_test_user",
    });
    mockAppEventLogFindFirst.mockResolvedValue({ userId: "user_from_session" });
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new NextRequest("https://example.com/api/account/preferences", {
      method: "PATCH",
      headers: {
        "x-mingle-session-key": "sess_test_user",
      },
      body: JSON.stringify({
        translationModel: "qwen/qwen3.5-9b",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { id: "user_from_session" },
      data: {
        translationModel: "qwen/qwen3.5-9b",
      },
    });
  });

  it("reconciles the provided tracking user id onto the session-linked user when external lookup misses", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockEnsureTrackingContext.mockImplementation((_request, _response, hints) => ({
      externalUserId: hints?.externalUserIdHint ?? "anon_seeded_user",
      sessionKey: hints?.sessionKeyHint ?? "sess_seeded_user",
    }));
    mockAppEventLogFindFirst.mockResolvedValue({ userId: "user_from_session" });
    mockUserUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const response = await PATCH(new NextRequest("https://example.com/api/account/preferences", {
      method: "PATCH",
      headers: {
        "x-mingle-user-id": "anon_local_storage_user",
        "x-mingle-session-key": "sess_local_storage_user",
      },
      body: JSON.stringify({
        translationModel: "qwen/qwen3.5-9b",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUserUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { externalUserId: "anon_local_storage_user" },
      data: {
        translationModel: "qwen/qwen3.5-9b",
      },
    });
    expect(mockUserUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "user_from_session" },
      data: {
        externalUserId: "anon_local_storage_user",
        translationModel: "qwen/qwen3.5-9b",
      },
    });
  });

  it("creates a tracked user and persists translation model for fresh anonymous sessions", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockUserUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const response = await PATCH(new NextRequest("https://example.com/api/account/preferences", {
      method: "PATCH",
      headers: {
        "x-mingle-session-key": "sess_new_desktop_user",
      },
      body: JSON.stringify({
        translationModel: "qwen/qwen3.5-9b",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUpsertTrackedUser).toHaveBeenCalledWith({
      tracking: {
        externalUserId: "anon_seeded_user",
        sessionKey: "sess_seeded_user",
      },
      clientContext: {
        language: null,
        pageLanguage: null,
        referrer: null,
        fullUrl: null,
        queryParams: null,
        screenWidth: null,
        screenHeight: null,
        timezone: null,
        platform: null,
        clientPlatform: null,
        apiNamespace: null,
        pathname: null,
        appVersion: null,
        usageSec: null,
      },
    });
    expect(mockUserUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "seeded_user_id" },
      data: {
        translationModel: "qwen/qwen3.5-9b",
      },
    });
  });

  it("persists translation model for fresh anonymous sessions using the provided x-mingle-user-id", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockEnsureTrackingContext.mockImplementation((_request, _response, hints) => ({
      externalUserId: hints?.externalUserIdHint ?? "anon_seeded_user",
      sessionKey: hints?.sessionKeyHint ?? "sess_seeded_user",
    }));
    mockUserUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const response = await PATCH(new NextRequest("https://example.com/api/account/preferences", {
      method: "PATCH",
      headers: {
        "x-mingle-user-id": "anon_local_storage_user",
        "x-mingle-session-key": "sess_local_storage_user",
      },
      body: JSON.stringify({
        translationModel: "qwen/qwen3.5-9b",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUserUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { externalUserId: "anon_local_storage_user" },
      data: {
        translationModel: "qwen/qwen3.5-9b",
      },
    });
    expect(mockUpsertTrackedUser).toHaveBeenCalledWith({
      tracking: {
        externalUserId: "anon_local_storage_user",
        sessionKey: "sess_local_storage_user",
      },
      clientContext: {
        language: null,
        pageLanguage: null,
        referrer: null,
        fullUrl: null,
        queryParams: null,
        screenWidth: null,
        screenHeight: null,
        timezone: null,
        platform: null,
        clientPlatform: null,
        apiNamespace: null,
        pathname: null,
        appVersion: null,
        usageSec: null,
      },
    });
    expect(mockUserUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "seeded_user_id" },
      data: {
        translationModel: "qwen/qwen3.5-9b",
      },
    });
  });
});
