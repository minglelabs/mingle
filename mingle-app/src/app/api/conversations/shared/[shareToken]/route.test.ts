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

  it("returns only the public snapshot fields and excludes hydration secrets", async () => {
    mockGetConversationHydrationStateForShare.mockResolvedValue({
      conversation: {
        id: "private-conversation-id",
        title: "Team sync",
        sessionKey: "secret-session-key",
        sequenceNumber: 42,
        status: "live",
        memberUserIds: ["private-member-id"],
      },
      usageSec: 3600,
      messageCount: 99,
      utterances: [{
        id: "private-message-id",
        serverMessageId: "private-server-message-id",
        originalText: "Hello from the shared snapshot",
        originalLang: "en",
        targetLanguages: ["ko"],
        translations: { ko: "공유된 스냅샷의 인사" },
        translationFinalized: { ko: true },
        createdAtMs: 123456,
        speaker: "Speaker 1",
        speakerAvatarSeed: "public-avatar-seed",
        speakerAvatarIndex: 2,
        speakerName: "Public speaker",
        speakerUserId: "private-speaker-user-id",
        speakerImage: "https://example.com/public-speaker.png",
        image: { conversationId: "private-image-conversation-id", messageId: "private-image-message-id", width: 12, height: 34 },
      }],
      hasMoreUtterances: true,
      oldestMessageCursor: { createdAtMs: 1, messageId: "private-cursor-message-id" },
      leaveNotices: [{ userId: "private-leave-user-id", name: "Private leaver", handle: "private-leaver", leftAtMs: 2 }],
      inviteNotices: [{
        inviteeUserId: "private-invitee-id",
        inviteeName: "Private invitee",
        inviteeHandle: "private-invitee",
        invitedByUserId: "private-inviter-id",
        invitedByName: "Private inviter",
        invitedByHandle: "private-inviter",
        invitedAtMs: 3,
      }],
      sharedByUserId: "user-owner",
    });

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/shared/tok-a"),
      { params: Promise.resolve({ shareToken: "tok-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      conversation: { title: "Team sync" },
      sharedByUserId: "user-owner",
      utterances: [{
        id: "snapshot-message-0",
        originalText: "Hello from the shared snapshot",
        originalLang: "en",
        targetLanguages: ["ko"],
        translations: { ko: "공유된 스냅샷의 인사" },
        translationFinalized: { ko: true },
        createdAtMs: 123456,
        speaker: "Speaker 1",
        speakerAvatarSeed: "public-avatar-seed",
        speakerAvatarIndex: 2,
        speakerName: "Public speaker",
        speakerUserId: "private-speaker-user-id",
        speakerImage: "https://example.com/public-speaker.png",
      }],
    });
    const serializedResponse = JSON.stringify(json);
    for (const secret of [
      "private-conversation-id",
      "secret-session-key",
      "private-member-id",
      "private-message-id",
      "private-server-message-id",
      "private-image-conversation-id",
      "private-image-message-id",
      "private-cursor-message-id",
      "private-leave-user-id",
      "private-invitee-id",
      "private-inviter-id",
      "usageSec",
      "leaveNotices",
      "inviteNotices",
      "hasMoreUtterances",
    ]) {
      expect(serializedResponse).not.toContain(secret);
    }
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
