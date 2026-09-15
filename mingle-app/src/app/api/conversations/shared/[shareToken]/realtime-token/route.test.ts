import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetConversationSessionKeyForShare, mockMintConversationRealtimeToken } = vi.hoisted(() => ({
  mockGetConversationSessionKeyForShare: vi.fn(),
  mockMintConversationRealtimeToken: vi.fn(),
}));

vi.mock("@/lib/app-conversations", () => ({
  getConversationSessionKeyForShare: mockGetConversationSessionKeyForShare,
}));

vi.mock("@/server/conversation-realtime", () => ({
  mintConversationRealtimeToken: mockMintConversationRealtimeToken,
}));

import { GET } from "@/app/api/conversations/shared/[shareToken]/realtime-token/route";

describe("/api/conversations/shared/[shareToken]/realtime-token route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mints a spectator-scoped token for an enabled share link, with no auth required", async () => {
    mockGetConversationSessionKeyForShare.mockResolvedValue("session-a");
    mockMintConversationRealtimeToken.mockReturnValue("signed.token");

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/shared/tok-a/realtime-token"),
      { params: Promise.resolve({ shareToken: "tok-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ token: "signed.token" });
    expect(mockMintConversationRealtimeToken).toHaveBeenCalledWith({
      sessionKey: "session-a",
      userId: "spectator:tok-a",
    });
  });

  it("returns not_found for a disabled or unknown share token", async () => {
    mockGetConversationSessionKeyForShare.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/shared/tok-a/realtime-token"),
      { params: Promise.resolve({ shareToken: "tok-a" }) },
    );

    expect(response.status).toBe(404);
    expect(mockMintConversationRealtimeToken).not.toHaveBeenCalled();
  });
});
