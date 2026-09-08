import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockAppFeedbackCreate,
  mockAppFeedbackFindMany,
  mockEnsureTrackingContext,
  mockParseClientContext,
  mockRequestAllowsLegacyAnonymousUser,
  mockUpsertTrackedUser,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockAppFeedbackCreate: vi.fn(),
  mockAppFeedbackFindMany: vi.fn(),
  mockEnsureTrackingContext: vi.fn(),
  mockParseClientContext: vi.fn(),
  mockRequestAllowsLegacyAnonymousUser: vi.fn(),
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
    },
    appFeedback: {
      create: mockAppFeedbackCreate,
      findMany: mockAppFeedbackFindMany,
    },
  },
}));

vi.mock("@/lib/app-analytics", () => ({
  ensureTrackingContext: mockEnsureTrackingContext,
  parseClientContext: mockParseClientContext,
  upsertTrackedUser: mockUpsertTrackedUser,
}));

vi.mock("@/lib/request-user-identity", () => ({
  requestAllowsLegacyAnonymousUser: mockRequestAllowsLegacyAnonymousUser,
}));

import { GET, POST } from "@/app/api/feedback/route";

describe("/api/feedback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);
    mockAppFeedbackCreate.mockResolvedValue({ id: "feedback_123" });
    mockAppFeedbackFindMany.mockResolvedValue([]);
    mockEnsureTrackingContext.mockImplementation((_request, _response, hints) => ({
      externalUserId: hints?.externalUserIdHint ?? "anon_user_123",
      sessionKey: hints?.sessionKeyHint ?? "sess_123",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      requestLocale: "ko-KR",
    }));
    mockParseClientContext.mockImplementation((payload: Record<string, unknown> | undefined) => ({
      language: typeof payload?.language === "string" ? payload.language : null,
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
      pathname: typeof payload?.pathname === "string" ? payload.pathname : null,
      appVersion: typeof payload?.appVersion === "string" ? payload.appVersion : null,
      usageSec: null,
    }));
    mockUpsertTrackedUser.mockResolvedValue("anon_user_row");
    mockRequestAllowsLegacyAnonymousUser.mockReturnValue(true);
  });

  it("returns empty threads when the tracking user has no saved feedback", async () => {
    const response = await GET(new NextRequest("https://example.com/api/feedback", {
      headers: {
        "x-mingle-user-id": "anon_user_123",
        "x-mingle-session-key": "sess_123",
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      threads: [],
    });
    expect(mockAppFeedbackFindMany).not.toHaveBeenCalled();
  });

  it("returns feedback threads with team replies for the current user", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user_feedback_1" });
    mockAppFeedbackFindMany.mockResolvedValue([
      {
        id: "feedback_123",
        category: "feedback",
        message: "The menu is hard to find.",
        contactEmail: "reply@example.com",
        createdAt: new Date("2026-04-02T12:00:00.000Z"),
        replies: [
          {
            id: "reply_1",
            authorType: "team",
            message: "We updated the menu layout today.",
            createdAt: new Date("2026-04-02T12:30:00.000Z"),
          },
        ],
      },
    ]);

    const response = await GET(new NextRequest("https://example.com/api/feedback", {
      headers: {
        "x-mingle-user-id": "anon_user_123",
        "x-mingle-session-key": "sess_123",
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      threads: [
        {
          id: "feedback_123",
          category: "feedback",
          contactEmail: "reply@example.com",
          createdAt: "2026-04-02T12:00:00.000Z",
          messages: [
            {
              id: "feedback_123:root",
              authorType: "user",
              message: "The menu is hard to find.",
              createdAt: "2026-04-02T12:00:00.000Z",
            },
            {
              id: "reply_1",
              authorType: "team",
              message: "We updated the menu layout today.",
              createdAt: "2026-04-02T12:30:00.000Z",
            },
          ],
        },
      ],
    });
    expect(mockAppFeedbackFindMany).toHaveBeenCalledWith({
      where: { userId: { in: ["user_feedback_1"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        category: true,
        message: true,
        contactEmail: true,
        createdAt: true,
        replies: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            authorType: true,
            message: true,
            createdAt: true,
          },
        },
      },
    });
  });

  it("returns only canonical account feedback after authentication", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "auth_user_123",
        email: "member@example.com",
      },
    });
    mockUserFindUnique.mockImplementation(async ({ where }: { where: Record<string, string> }) => {
      if (where.id === "auth_user_123") {
        return { id: "auth_user_123" };
      }
      if (where.email === "member@example.com") {
        return { id: "auth_user_123" };
      }
      if (where.externalUserId === "anon_user_123") {
        return { id: "anon_user_row" };
      }
      return null;
    });
    mockAppFeedbackFindMany.mockResolvedValue([
      {
        id: "feedback_auth",
        category: "inquiry",
        message: "I signed in and have another question.",
        contactEmail: "member@example.com",
        createdAt: new Date("2026-04-03T09:00:00.000Z"),
        replies: [],
      },
    ]);

    const response = await GET(new NextRequest("https://example.com/api/feedback", {
      headers: {
        "x-mingle-user-id": "anon_user_123",
        "x-mingle-session-key": "sess_123",
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      threads: [
        {
          id: "feedback_auth",
          category: "inquiry",
          contactEmail: "member@example.com",
          createdAt: "2026-04-03T09:00:00.000Z",
          messages: [
            {
              id: "feedback_auth:root",
              authorType: "user",
              message: "I signed in and have another question.",
              createdAt: "2026-04-03T09:00:00.000Z",
            },
          ],
        },
      ],
    });

    const findManyArgs = mockAppFeedbackFindMany.mock.calls[0]?.[0];
    expect(findManyArgs).toMatchObject({
      where: {
        userId: {
          in: ["auth_user_123"],
        },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  it("rejects current anonymous feedback without creating a User row", async () => {
    mockRequestAllowsLegacyAnonymousUser.mockReturnValue(false);

    const response = await POST(new NextRequest("https://example.com/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        category: "feedback",
        message: "This is long enough.",
      }),
    }));

    expect(response.status).toBe(401);
    expect(mockUpsertTrackedUser).not.toHaveBeenCalled();
    expect(mockAppFeedbackCreate).not.toHaveBeenCalled();
  });

  it("does not merge another authenticated account via the shared session key", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "auth_user_b",
        email: "member-b@example.com",
      },
    });
    mockUserFindUnique.mockImplementation(async ({ where }: { where: Record<string, string> }) => {
      if (where.id === "auth_user_b") {
        return { id: "auth_user_b" };
      }
      if (where.email === "member-b@example.com") {
        return { id: "auth_user_b" };
      }
      return null;
    });

    const response = await GET(new NextRequest("https://example.com/api/feedback", {
      headers: {
        "x-mingle-session-key": "shared_sess_123",
      },
    }));

    expect(response.status).toBe(200);
    expect(mockAppFeedbackFindMany).toHaveBeenCalledWith({
      where: { userId: { in: ["auth_user_b"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        category: true,
        message: true,
        contactEmail: true,
        createdAt: true,
        replies: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            authorType: true,
            message: true,
            createdAt: true,
          },
        },
      },
    });
  });

  it("rejects messages that are too short", async () => {
    const response = await POST(new NextRequest("https://example.com/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        category: "feedback",
        message: "1234",
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "message_too_short",
    });
    expect(mockAppFeedbackCreate).not.toHaveBeenCalled();
    expect(mockUpsertTrackedUser).not.toHaveBeenCalled();
  });

  it("stores anonymous feedback with tracking and client context", async () => {
    const response = await POST(new NextRequest("https://example.com/api/feedback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mingle-app-version": "1.0.9",
        "x-mingle-api-namespace": "ios/v1.0.9",
        "x-mingle-client-platform": "ios",
      },
      body: JSON.stringify({
        category: "suggestion",
        message: "Please add a faster way to contact support from the app menu.",
        contactEmail: "reply@example.com",
        locale: "ko",
        pathname: "/ko",
      }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      feedbackId: "feedback_123",
    });
    expect(mockUpsertTrackedUser).toHaveBeenCalledWith({
      tracking: expect.objectContaining({
        externalUserId: "anon_user_123",
        sessionKey: "sess_123",
      }),
      clientContext: expect.objectContaining({
        language: "ko",
        pathname: "/ko",
        clientPlatform: "ios",
        apiNamespace: "ios/v1.0.9",
        appVersion: "1.0.9",
      }),
    });
    expect(mockAppFeedbackCreate).toHaveBeenCalledWith({
      data: {
        userId: "anon_user_row",
        sessionKey: "sess_123",
        category: "suggestion",
        message: "Please add a faster way to contact support from the app menu.",
        contactEmail: "reply@example.com",
        locale: "ko",
        clientPlatform: "ios",
        appVersion: "1.0.9",
        apiNamespace: "ios/v1.0.9",
        pathname: "/ko",
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
      },
      select: { id: true },
    });
  });

  it("uses the authenticated user and falls back to the session email", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user_123",
        email: "member@example.com",
      },
    });
    mockUserFindUnique.mockResolvedValue({ id: "user_123" });

    const response = await POST(new NextRequest("https://example.com/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        category: "inquiry",
        message: "I need help understanding why my background translation stopped.",
        locale: "en",
        pathname: "/en",
      }),
    }));

    expect(response.status).toBe(201);
    expect(mockUpsertTrackedUser).not.toHaveBeenCalled();
    expect(mockAppFeedbackCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_123",
        sessionKey: "sess_123",
        category: "inquiry",
        message: "I need help understanding why my background translation stopped.",
        contactEmail: "member@example.com",
        locale: "en",
        clientPlatform: undefined,
        appVersion: undefined,
        apiNamespace: undefined,
        pathname: "/en",
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
      },
      select: { id: true },
    });
  });

  it("rejects invalid reply emails", async () => {
    const response = await POST(new NextRequest("https://example.com/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        category: "feedback",
        message: "This is long enough but the email should fail validation.",
        contactEmail: "invalid-email",
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_contact_email",
    });
    expect(mockAppFeedbackCreate).not.toHaveBeenCalled();
  });
});
