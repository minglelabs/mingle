import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetServerSession,
  mockRequireConversationMembership,
  mockMintConversationRealtimeToken,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockRequireConversationMembership: vi.fn(),
  mockMintConversationRealtimeToken: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth-options", () => ({ getAuthOptions: () => ({}) }));

vi.mock("@/server/conversation-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/conversation-messages")>();
  return {
    ...actual,
    requireConversationMembership: mockRequireConversationMembership,
  };
});

vi.mock("@/server/conversation-realtime", () => ({
  mintConversationRealtimeToken: mockMintConversationRealtimeToken,
}));

import { ConversationMessageError } from "@/server/conversation-messages";
import { POST } from "./route";

function params(conversationId: string) {
  return { params: Promise.resolve({ conversationId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/conversations/[conversationId]/realtime-token", () => {
  it("rejects an unauthenticated caller", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await POST(new Request("http://x"), params("conv-1"));

    expect(response.status).toBe(401);
    expect(mockRequireConversationMembership).not.toHaveBeenCalled();
  });

  it("rejects a caller who is not a member of the conversation", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockRequireConversationMembership.mockRejectedValue(new ConversationMessageError("not_a_member"));

    const response = await POST(new Request("http://x"), params("conv-1"));

    expect(response.status).toBe(403);
    expect(mockMintConversationRealtimeToken).not.toHaveBeenCalled();
  });

  it("mints a token for a confirmed member", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockRequireConversationMembership.mockResolvedValue(undefined);
    mockMintConversationRealtimeToken.mockReturnValue("signed-token");

    const response = await POST(new Request("http://x"), params("conv-1"));
    const body = await response.json() as { token: string | null };

    expect(response.status).toBe(200);
    expect(body.token).toBe("signed-token");
    expect(mockMintConversationRealtimeToken).toHaveBeenCalledWith({ conversationId: "conv-1", userId: "u1" });
  });

  it("returns a null token, not an error, when realtime push is unconfigured", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockRequireConversationMembership.mockResolvedValue(undefined);
    mockMintConversationRealtimeToken.mockReturnValue(null);

    const response = await POST(new Request("http://x"), params("conv-1"));
    const body = await response.json() as { token: string | null };

    expect(response.status).toBe(200);
    expect(body.token).toBeNull();
  });
});
