import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockAppMessageFindMany,
  mockAppMessageUpdateMany,
  mockAppMessageContentUpdateMany,
  mockAppEventLogCreate,
  mockPrismaTransaction,
  mockEnsureTrackingContext,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockAppMessageFindMany: vi.fn(),
  mockAppMessageUpdateMany: vi.fn(),
  mockAppMessageContentUpdateMany: vi.fn(),
  mockAppEventLogCreate: vi.fn(),
  mockPrismaTransaction: vi.fn(),
  mockEnsureTrackingContext: vi.fn(),
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
    appMessage: {
      findMany: mockAppMessageFindMany,
      updateMany: mockAppMessageUpdateMany,
    },
    appMessageContent: {
      updateMany: mockAppMessageContentUpdateMany,
    },
    appEventLog: {
      create: mockAppEventLogCreate,
    },
    $transaction: mockPrismaTransaction,
  },
}));

vi.mock("@/lib/app-analytics", () => ({
  ensureTrackingContext: mockEnsureTrackingContext,
}));

import { DELETE } from "@/app/api/messages/route";

describe("/api/messages route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);
    mockAppMessageFindMany.mockResolvedValue([]);
    mockAppMessageUpdateMany.mockResolvedValue({ count: 0 });
    mockAppMessageContentUpdateMany.mockResolvedValue({ count: 0 });
    mockAppEventLogCreate.mockResolvedValue({ id: "event_123" });
    mockPrismaTransaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
    mockEnsureTrackingContext.mockImplementation((_request, _response, hints) => ({
      externalUserId: hints?.externalUserIdHint ?? "anon_user_123",
      sessionKey: hints?.sessionKeyHint ?? "sess_123",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      requestLocale: "ko-KR",
    }));
  });

  it("returns zero counts when the current user has no stored messages", async () => {
    const response = await DELETE(new NextRequest("https://example.com/api/messages", {
      method: "DELETE",
      headers: {
        "x-mingle-user-id": "anon_user_123",
        "x-mingle-session-key": "sess_123",
        "x-mingle-conversation-cleared-at-ms": "1700000000456",
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deletedMessageCount: 0,
      deletedContentCount: 0,
    });
    expect(mockAppMessageUpdateMany).not.toHaveBeenCalled();
    expect(mockAppMessageContentUpdateMany).not.toHaveBeenCalled();
    expect(mockAppEventLogCreate).toHaveBeenCalledWith({
      data: {
        userId: undefined,
        sessionKey: "sess_123",
        eventType: "conversation_history_cleared",
        metadata: {
          clientClearedAtMs: 1700000000456,
        },
      },
    });
  });

  it("soft deletes matched messages and contents for the current tracked user", async () => {
    mockUserFindUnique.mockImplementation(async ({ where }: { where: Record<string, string> }) => {
      if (where.externalUserId === "anon_user_123") {
        return { id: "tracked_user_row" };
      }
      return null;
    });
    mockAppMessageFindMany.mockResolvedValue([
      { id: "message_1" },
      { id: "message_2" },
    ]);
    mockAppMessageUpdateMany.mockResolvedValue({ count: 2 });
    mockAppMessageContentUpdateMany.mockResolvedValue({ count: 5 });

    const response = await DELETE(new NextRequest("https://example.com/api/messages", {
      method: "DELETE",
      headers: {
        "x-mingle-user-id": "anon_user_123",
        "x-mingle-session-key": "sess_123",
        "x-mingle-conversation-cleared-at-ms": "1700000001234",
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deletedMessageCount: 2,
      deletedContentCount: 5,
    });
    expect(mockAppMessageFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userId: { in: ["tracked_user_row"] } },
          { sessionKey: "sess_123" },
        ],
        isDeleted: { not: true },
      },
      select: {
        id: true,
      },
    });
    expect(mockAppMessageUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["message_1", "message_2"] },
      },
      data: {
        isDeleted: true,
      },
    });
    expect(mockAppMessageContentUpdateMany).toHaveBeenCalledWith({
      where: {
        messageId: { in: ["message_1", "message_2"] },
      },
      data: {
        isDeleted: true,
      },
    });
    expect(mockAppEventLogCreate).toHaveBeenCalledWith({
      data: {
        userId: "tracked_user_row",
        sessionKey: "sess_123",
        eventType: "conversation_history_cleared",
        metadata: {
          clientClearedAtMs: 1700000001234,
        },
      },
    });
  });

  it("soft deletes both authenticated and anonymous device messages in one request", async () => {
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
    mockAppMessageFindMany.mockResolvedValue([{ id: "message_auth" }]);

    const response = await DELETE(new NextRequest("https://example.com/api/messages", {
      method: "DELETE",
      headers: {
        "x-mingle-user-id": "anon_user_123",
        "x-mingle-session-key": "sess_123",
      },
    }));

    expect(response.status).toBe(200);
    expect(mockAppMessageFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userId: { in: ["auth_user_123", "anon_user_row"] } },
          { sessionKey: "sess_123" },
        ],
        isDeleted: { not: true },
      },
      select: {
        id: true,
      },
    });
  });
});
