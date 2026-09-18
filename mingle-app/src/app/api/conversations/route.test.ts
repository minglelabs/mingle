import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockGetServerSession,
  mockListConversationChannelsForExternalUserId,
  mockListConversationChannelsForUser,
  mockCreateConversationChannelForUser,
  mockFindExistingConversationWithExactMembers,
  mockEnsureTrackingContext,
  mockNormalizeSessionUserIdentity,
  mockResolveOrCreateUserIdForRequest,
  mockResolveTrackingExternalUserId,
  mockResolveTrackingSessionKey,
  mockRequestAllowsLegacyAnonymousUser,
  mockSanitizeRequestIdentityValue,
  mockSanitizeSttLanguageSelection,
  mockUserFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockListConversationChannelsForExternalUserId: vi.fn(),
  mockListConversationChannelsForUser: vi.fn(),
  mockCreateConversationChannelForUser: vi.fn(),
  mockFindExistingConversationWithExactMembers: vi.fn(),
  mockEnsureTrackingContext: vi.fn(),
  mockNormalizeSessionUserIdentity: vi.fn(),
  mockResolveOrCreateUserIdForRequest: vi.fn(),
  mockResolveTrackingExternalUserId: vi.fn(),
  mockResolveTrackingSessionKey: vi.fn(),
  mockRequestAllowsLegacyAnonymousUser: vi.fn(),
  mockSanitizeRequestIdentityValue: vi.fn((value: string) => value.trim()),
  mockSanitizeSttLanguageSelection: vi.fn((value: unknown) => Array.isArray(value) ? value : []),
  mockUserFindMany: vi.fn(),
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
      findMany: mockUserFindMany,
    },
  },
}));

vi.mock("@/lib/app-conversations", () => ({
  listConversationChannelsForExternalUserId: mockListConversationChannelsForExternalUserId,
  listConversationChannelsForUser: mockListConversationChannelsForUser,
  createConversationChannelForUser: mockCreateConversationChannelForUser,
  findExistingConversationWithExactMembers: mockFindExistingConversationWithExactMembers,
  MAX_CONVERSATION_MEMBERS: 10,
}));

vi.mock("@/lib/app-analytics", () => ({
  ensureTrackingContext: mockEnsureTrackingContext,
}));

vi.mock("@/lib/stt-languages", () => ({
  sanitizeSttLanguageSelection: mockSanitizeSttLanguageSelection,
}));

vi.mock("@/lib/request-user-identity", () => ({
  normalizeSessionUserIdentity: mockNormalizeSessionUserIdentity,
  requestAllowsLegacyAnonymousUser: mockRequestAllowsLegacyAnonymousUser,
  resolveOrCreateUserIdForRequest: mockResolveOrCreateUserIdForRequest,
  resolveTrackingExternalUserId: mockResolveTrackingExternalUserId,
  resolveTrackingSessionKey: mockResolveTrackingSessionKey,
  sanitizeRequestIdentityValue: mockSanitizeRequestIdentityValue,
}));

import { GET, POST } from "@/app/api/conversations/route";

describe("/api/conversations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockNormalizeSessionUserIdentity.mockReturnValue({
      id: "",
      email: "",
      externalUserId: "",
      sessionKey: "",
    });
    mockResolveTrackingExternalUserId.mockReturnValue("anon_local_storage_user");
    mockResolveTrackingSessionKey.mockReturnValue("sess_local_storage_user");
    mockRequestAllowsLegacyAnonymousUser.mockImplementation(
      (request: Request) => request.url.includes("/v1."),
    );
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "tracked_user_123",
      identity: {
        id: "",
        email: "",
        externalUserId: "anon_local_storage_user",
        sessionKey: "sess_local_storage_user",
      },
      tracking: {
        externalUserId: "anon_local_storage_user",
        sessionKey: "sess_local_storage_user",
      },
    });
    mockEnsureTrackingContext.mockReturnValue({
      externalUserId: "anon_local_storage_user",
      sessionKey: "sess_local_storage_user",
    });
    mockFindExistingConversationWithExactMembers.mockResolvedValue(null);
    mockUserFindMany.mockImplementation(
      async (args: { where?: { id?: { in?: string[] } } }) => (
        (args.where?.id?.in ?? []).map((id) => ({ id }))
      ),
    );
  });

  it("uses the native list fast path without resolving the guest user twice", async () => {
    mockListConversationChannelsForExternalUserId.mockResolvedValue([
      {
        id: "conv_native_1",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "active",
        sessionKey: "conv_native_session_1",
        selectedLanguages: ["en", "ko"],
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:01:00.000Z",
        pausedAt: null,
      },
    ]);

    const response = await GET(new NextRequest(
      "https://example.com/api/ios/v1.1.4/conversations?view=native-list",
      {
        headers: {
          "x-mingle-user-id": "anon_local_storage_user",
          "x-mingle-session-key": "sess_local_storage_user",
        },
      },
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      conversations: [
        expect.objectContaining({
          id: "conv_native_1",
          sessionKey: "conv_native_session_1",
        }),
      ],
    });
    expect(mockListConversationChannelsForExternalUserId).toHaveBeenCalledWith(
      "anon_local_storage_user",
    );
    expect(mockResolveOrCreateUserIdForRequest).not.toHaveBeenCalled();
    expect(mockListConversationChannelsForUser).not.toHaveBeenCalled();
    expect(mockEnsureTrackingContext).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.any(NextResponse),
      {
        externalUserIdHint: "anon_local_storage_user",
        sessionKeyHint: "sess_local_storage_user",
      },
    );
  });

  it("lists conversations for a guest request identified by the header seed", async () => {
    mockListConversationChannelsForUser.mockResolvedValue([
      {
        id: "conv_1",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "active",
        sessionKey: "conv_session_1",
        selectedLanguages: ["en", "ko", "ja"],
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:01:00.000Z",
        pausedAt: null,
      },
    ]);

    const response = await GET(new NextRequest("https://example.com/api/conversations", {
      headers: {
        "x-mingle-user-id": "anon_local_storage_user",
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      conversations: [
        {
          id: "conv_1",
          sequenceNumber: 1,
          title: "Conversation (1)",
          status: "active",
          sessionKey: "conv_session_1",
          selectedLanguages: ["en", "ko", "ja"],
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:01:00.000Z",
          pausedAt: null,
        },
      ],
    });
    expect(mockResolveOrCreateUserIdForRequest).toHaveBeenCalledWith({
      request: expect.any(NextRequest),
      session: null,
    });
    expect(mockListConversationChannelsForUser).toHaveBeenCalledWith("tracked_user_123");
    expect(mockEnsureTrackingContext).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.any(NextResponse),
      expect.objectContaining({
        externalUserIdHint: "anon_local_storage_user",
        sessionKeyHint: "sess_local_storage_user",
      }),
    );
  });

  it("creates a new conversation for a guest request", async () => {
    mockCreateConversationChannelForUser.mockResolvedValue({
      id: "conv_2",
      sequenceNumber: 2,
      title: "Conversation (2)",
      status: "paused",
      sessionKey: "conv_session_2",
      selectedLanguages: ["en", "ko", "ja"],
      createdAt: "2026-04-02T00:02:00.000Z",
      updatedAt: "2026-04-02T00:02:00.000Z",
      pausedAt: "2026-04-02T00:02:00.000Z",
    });

    const response = await POST(new NextRequest("https://example.com/api/conversations", {
      method: "POST",
      headers: {
        "x-mingle-user-id": "anon_local_storage_user",
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      conversation: {
        id: "conv_2",
        sequenceNumber: 2,
        title: "Conversation (2)",
        status: "paused",
        sessionKey: "conv_session_2",
        selectedLanguages: ["en", "ko", "ja"],
        createdAt: "2026-04-02T00:02:00.000Z",
        updatedAt: "2026-04-02T00:02:00.000Z",
        pausedAt: "2026-04-02T00:02:00.000Z",
      },
      reused: false,
    });
    expect(mockCreateConversationChannelForUser).toHaveBeenCalledWith("tracked_user_123", {
      locale: "en",
      preferredSessionKey: undefined,
      selectedLanguages: [],
      speechLanguages: [],
      translationLanguagesLinked: true,
      inviteeUserIds: [],
    });
  });

  it("returns a conflict error instead of leaking a raw 500 when creation exhausts its retries", async () => {
    mockCreateConversationChannelForUser.mockRejectedValue(
      new Error("conversation_channel_create_conflict"),
    );

    const response = await POST(new NextRequest("https://example.com/api/conversations", {
      method: "POST",
      headers: {
        "x-mingle-user-id": "anon_local_storage_user",
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({ error: "conversation_channel_create_conflict" });
  });

  it("creates a new conversation seeded with the legacy single-room session key", async () => {
    mockCreateConversationChannelForUser.mockResolvedValue({
      id: "conv_legacy",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "sess_legacy_room",
      selectedLanguages: ["en", "fr"],
      createdAt: "2026-04-02T00:02:00.000Z",
      updatedAt: "2026-04-02T00:02:00.000Z",
      pausedAt: "2026-04-02T00:02:00.000Z",
    });

    const response = await POST(new NextRequest("https://example.com/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mingle-user-id": "anon_local_storage_user",
      },
      body: JSON.stringify({ legacySessionKey: "sess_legacy_room" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      conversation: {
        id: "conv_legacy",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "sess_legacy_room",
        selectedLanguages: ["en", "fr"],
        createdAt: "2026-04-02T00:02:00.000Z",
        updatedAt: "2026-04-02T00:02:00.000Z",
        pausedAt: "2026-04-02T00:02:00.000Z",
      },
      reused: false,
    });
    expect(mockCreateConversationChannelForUser).toHaveBeenCalledWith("tracked_user_123", {
      locale: "en",
      preferredSessionKey: "sess_legacy_room",
      selectedLanguages: [],
      speechLanguages: [],
      translationLanguagesLinked: true,
      inviteeUserIds: [],
    });
  });

  it("creates a new conversation seeded with selected and speech languages", async () => {
    mockSanitizeSttLanguageSelection
      .mockReturnValueOnce(["en", "fr"])
      .mockReturnValueOnce(["ko", "ja"]);
    mockCreateConversationChannelForUser.mockResolvedValue({
      id: "conv_3",
      sequenceNumber: 3,
      title: "Conversation (3)",
      status: "paused",
      sessionKey: "conv_session_3",
      selectedLanguages: ["en", "fr"],
      speechLanguages: ["ko", "ja"],
      createdAt: "2026-04-02T00:02:00.000Z",
      updatedAt: "2026-04-02T00:02:00.000Z",
      pausedAt: "2026-04-02T00:02:00.000Z",
    });

    const response = await POST(new NextRequest("https://example.com/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mingle-user-id": "anon_local_storage_user",
      },
      body: JSON.stringify({
        locale: "ko",
        selectedLanguages: ["en", "fr"],
        speechLanguages: ["ko", "ja"],
        translationLanguagesLinked: false,
      }),
    }));

    expect(response.status).toBe(201);
    expect(mockCreateConversationChannelForUser).toHaveBeenCalledWith("tracked_user_123", {
      locale: "ko",
      preferredSessionKey: undefined,
      selectedLanguages: ["en", "fr"],
      speechLanguages: ["ko", "ja"],
      translationLanguagesLinked: false,
      inviteeUserIds: [],
    });
  });

  it("returns the existing room instead of creating a duplicate when the exact same invitees already have one", async () => {
    mockFindExistingConversationWithExactMembers.mockResolvedValue({
      id: "conv_existing",
      sequenceNumber: 1,
      title: "Alice, Bob",
      status: "paused",
      sessionKey: "conv_session_existing",
      selectedLanguages: ["en"],
      createdAt: "2026-04-02T00:02:00.000Z",
      updatedAt: "2026-04-02T00:02:00.000Z",
      pausedAt: "2026-04-02T00:02:00.000Z",
    });

    const response = await POST(new NextRequest("https://example.com/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mingle-user-id": "anon_local_storage_user",
      },
      body: JSON.stringify({ inviteeUserIds: ["user-a", "user-b"] }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      conversation: {
        id: "conv_existing",
        sequenceNumber: 1,
        title: "Alice, Bob",
        status: "paused",
        sessionKey: "conv_session_existing",
        selectedLanguages: ["en"],
        createdAt: "2026-04-02T00:02:00.000Z",
        updatedAt: "2026-04-02T00:02:00.000Z",
        pausedAt: "2026-04-02T00:02:00.000Z",
      },
      reused: true,
    });
    expect(mockFindExistingConversationWithExactMembers).toHaveBeenCalledWith({
      userId: "tracked_user_123",
      otherUserIds: ["user-a", "user-b"],
    });
    expect(mockCreateConversationChannelForUser).not.toHaveBeenCalled();
  });

  it("rejects invitees that do not exist before checking or storing a room", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "user-a" }]);

    const response = await POST(new NextRequest("https://example.com/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mingle-user-id": "anon_local_storage_user",
      },
      body: JSON.stringify({ inviteeUserIds: ["user-a", "missing-user"] }),
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "invalid_invitee_user_ids" });
    expect(mockFindExistingConversationWithExactMembers).not.toHaveBeenCalled();
    expect(mockCreateConversationChannelForUser).not.toHaveBeenCalled();
  });

  it("skips the duplicate-room check and creates a new room when force is true", async () => {
    mockCreateConversationChannelForUser.mockResolvedValue({
      id: "conv_forced",
      sequenceNumber: 2,
      title: "Conversation (2)",
      status: "paused",
      sessionKey: "conv_session_forced",
      selectedLanguages: [],
      createdAt: "2026-04-02T00:02:00.000Z",
      updatedAt: "2026-04-02T00:02:00.000Z",
      pausedAt: "2026-04-02T00:02:00.000Z",
    });

    const response = await POST(new NextRequest("https://example.com/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mingle-user-id": "anon_local_storage_user",
      },
      body: JSON.stringify({ inviteeUserIds: ["user-a", "user-b"], force: true }),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      conversation: {
        id: "conv_forced",
        sequenceNumber: 2,
        title: "Conversation (2)",
        status: "paused",
        sessionKey: "conv_session_forced",
        selectedLanguages: [],
        createdAt: "2026-04-02T00:02:00.000Z",
        updatedAt: "2026-04-02T00:02:00.000Z",
        pausedAt: "2026-04-02T00:02:00.000Z",
      },
      reused: false,
    });
    expect(mockFindExistingConversationWithExactMembers).not.toHaveBeenCalled();
  });

  it("doesn't check for a duplicate room when there are no invitees (start alone)", async () => {
    mockCreateConversationChannelForUser.mockResolvedValue({
      id: "conv_solo",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "conv_session_solo",
      selectedLanguages: [],
      createdAt: "2026-04-02T00:02:00.000Z",
      updatedAt: "2026-04-02T00:02:00.000Z",
      pausedAt: "2026-04-02T00:02:00.000Z",
    });

    const response = await POST(new NextRequest("https://example.com/api/conversations", {
      method: "POST",
      headers: {
        "x-mingle-user-id": "anon_local_storage_user",
      },
    }));

    expect(response.status).toBe(201);
    expect(mockFindExistingConversationWithExactMembers).not.toHaveBeenCalled();
  });

  it("returns unauthorized when the request identity cannot resolve to a user", async () => {
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "",
      identity: {
        id: "",
        email: "",
        externalUserId: "",
        sessionKey: "",
      },
      tracking: null,
    });

    const response = await GET(new NextRequest("https://example.com/api/conversations"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "unauthorized" });
    expect(mockListConversationChannelsForUser).not.toHaveBeenCalled();
  });
});
