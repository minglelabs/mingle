import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetConversationHydrationStateForShare } = vi.hoisted(() => ({
  mockGetConversationHydrationStateForShare: vi.fn(),
}));

vi.mock("@/lib/app-conversations", () => ({
  getConversationHydrationStateForShare: mockGetConversationHydrationStateForShare,
}));

vi.mock("@/server/conversation-realtime", () => ({
  mintConversationRealtimeToken: vi.fn(),
}));

import { GET } from "@/app/api/conversations/shared/[shareToken]/route";

describe("/api/conversations/shared/[shareToken] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the spectate state for an enabled share link, with no auth required", async () => {
    mockGetConversationHydrationStateForShare.mockResolvedValue({
      conversation: { id: "conv-a", title: "Team sync" },
      utterances: [],
      sharedByUserId: "user-owner",
    });

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/shared/tok-a"),
      { params: Promise.resolve({ shareToken: "tok-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.sharedByUserId).toBe("user-owner");
    expect(mockGetConversationHydrationStateForShare).toHaveBeenCalledWith({ shareToken: "tok-a" });
  });

  it("returns not_found for a disabled or unknown share token", async () => {
    mockGetConversationHydrationStateForShare.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/shared/tok-a"),
      { params: Promise.resolve({ shareToken: "tok-a" }) },
    );

    expect(response.status).toBe(404);
  });

  it("passes a pagination cursor through to the hydration lookup", async () => {
    mockGetConversationHydrationStateForShare.mockResolvedValue({
      conversation: { id: "conv-a" },
      utterances: [],
      sharedByUserId: null,
    });

    await GET(
      new NextRequest("https://example.com/api/conversations/shared/tok-a?beforeCreatedAtMs=100&beforeMessageId=msg-1"),
      { params: Promise.resolve({ shareToken: "tok-a" }) },
    );

    expect(mockGetConversationHydrationStateForShare).toHaveBeenCalledWith({
      shareToken: "tok-a",
      before: { createdAtMs: 100, messageId: "msg-1" },
    });
  });

  it("rejects an invalid pagination cursor", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/conversations/shared/tok-a?beforeCreatedAtMs=not-a-number&beforeMessageId=msg-1"),
      { params: Promise.resolve({ shareToken: "tok-a" }) },
    );

    expect(response.status).toBe(400);
    expect(mockGetConversationHydrationStateForShare).not.toHaveBeenCalled();
  });
});
