import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockSession, mockSessionKey, mockMembers, mockFindFirst, mockUpdate, mockUpdateContents, mockNotify } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockSessionKey: vi.fn(),
  mockMembers: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateContents: vi.fn(),
  mockNotify: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/auth-options", () => ({ getAuthOptions: () => ({}) }));
vi.mock("@/lib/app-conversations", () => ({
  getConversationSessionKeyForMember: mockSessionKey,
  listChannelMemberUserIdsBySessionKey: mockMembers,
}));
vi.mock("@/server/conversation-realtime", () => ({ notifyConversationMessage: mockNotify }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (operations: unknown[]) => Promise.all(operations),
    appMessage: { findFirst: mockFindFirst, update: mockUpdate },
    appMessageContent: { updateMany: mockUpdateContents },
  },
}));

import { POST } from "./route";

function recall(body: unknown) {
  return POST(new NextRequest("https://example.com/api/conversations/room_1/recall", {
    method: "POST", body: JSON.stringify(body),
  }), { params: Promise.resolve({ conversationId: "room_1" }) });
}

describe("POST /api/conversations/[conversationId]/recall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "user_1" } });
    mockSessionKey.mockResolvedValue("sess_1");
    mockMembers.mockResolvedValue(["user_1", "user_2"]);
    mockFindFirst.mockResolvedValue({ id: "msg_1", userId: "user_1", isDeleted: false, metadata: { image: { objectKey: "k" } } });
  });

  it("soft-deletes the sender's own message and notifies the room", async () => {
    const response = await recall({ messageId: "u-1700000000000-1" });

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "msg_1" },
      data: { isDeleted: true, metadata: { image: { objectKey: "k" }, recalledAtMs: expect.any(Number) } },
    });
    expect(mockUpdateContents).toHaveBeenCalledWith({ where: { messageId: "msg_1" }, data: { isDeleted: true } });
    expect(mockNotify).toHaveBeenCalledWith("sess_1", ["user_1", "user_2"], undefined, { timeoutMs: 3000 });
  });

  it("refuses another member's message", async () => {
    mockFindFirst.mockResolvedValue({ id: "msg_1", userId: "user_2", isDeleted: false, metadata: null });

    expect((await recall({ messageId: "u-1700000000000-1" })).status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent for an already recalled message", async () => {
    mockFindFirst.mockResolvedValue({ id: "msg_1", userId: "user_1", isDeleted: true, metadata: { recalledAtMs: 1 } });

    expect((await recall({ messageId: "u-1700000000000-1" })).status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects non-members, anonymous callers and unknown messages", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    expect((await recall({ messageId: "missing" })).status).toBe(404);
    mockSessionKey.mockResolvedValueOnce(null);
    expect((await recall({ messageId: "u-1" })).status).toBe(404);
    mockSession.mockResolvedValueOnce(null);
    expect((await recall({ messageId: "u-1" })).status).toBe(401);
    expect((await recall({})).status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
