import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetConversationHydrationStateForShare, mockGetUserProfile } = vi.hoisted(() => ({
  mockGetConversationHydrationStateForShare: vi.fn(),
  mockGetUserProfile: vi.fn(),
}));

vi.mock("@/lib/app-conversations", () => ({
  getConversationHydrationStateForShare: mockGetConversationHydrationStateForShare,
}));

vi.mock("@/server/user-profile", () => ({
  getUserProfile: mockGetUserProfile,
}));

vi.mock("@/server/conversation-realtime", () => ({
  mintConversationRealtimeToken: vi.fn(),
}));

import { GET } from "@/app/api/conversations/shared/[shareToken]/route";

// Every account id the fixture below feeds into the hydration state. NONE of
// them may reach a payload that anyone holding the share link can read — the
// public response identifies speakers by an opaque per-response alias only.
const FIXTURE_USER_IDS = [
  "private-member-id",
  "private-speaker-user-id",
  "private-second-speaker-user-id",
  "private-leave-user-id",
  "private-invitee-id",
  "private-inviter-id",
  "user-owner",
];

function collectStringValues(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStringValues(item, into);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStringValues(item, into);
  }
  return into;
}

function collectKeys(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) collectKeys(item, into);
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      into.push(key);
      collectKeys(item, into);
    }
  }
  return into;
}

describe("/api/conversations/shared/[shareToken] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserProfile.mockResolvedValue({
      id: "user-owner",
      name: "Room Owner",
      image: "https://example.com/owner.png",
      imageCropScale: 1.2,
      imageCropX: 3,
      imageCropY: 4,
      handle: "owner",
    });
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
      sharedBy: {
        name: "Room Owner",
        image: "https://example.com/owner.png",
        imageCropScale: 1.2,
        imageCropX: 3,
        imageCropY: 4,
      },
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
        speakerAlias: "s1",
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

  it("carries no account id anywhere in the public payload, only per-response speaker aliases", async () => {
    mockGetConversationHydrationStateForShare.mockResolvedValue({
      conversation: { id: "private-conversation-id", title: "Team sync", memberUserIds: ["private-member-id"] },
      utterances: [
        {
          id: "private-message-id",
          originalText: "First speaker",
          originalLang: "en",
          targetLanguages: [],
          translations: {},
          translationFinalized: {},
          createdAtMs: 1,
          speaker: null,
          speakerAvatarSeed: null,
          speakerAvatarIndex: null,
          speakerName: "Alice",
          speakerUserId: "private-speaker-user-id",
          speakerImage: null,
        },
        {
          id: "private-message-id-2",
          originalText: "Second speaker",
          originalLang: "en",
          targetLanguages: [],
          translations: {},
          translationFinalized: {},
          createdAtMs: 2,
          speaker: null,
          speakerAvatarSeed: null,
          speakerAvatarIndex: null,
          speakerName: "Bob",
          speakerUserId: "private-second-speaker-user-id",
          speakerImage: null,
        },
        {
          id: "private-message-id-3",
          originalText: "First speaker again",
          originalLang: "en",
          targetLanguages: [],
          translations: {},
          translationFinalized: {},
          createdAtMs: 3,
          speaker: null,
          speakerAvatarSeed: null,
          speakerAvatarIndex: null,
          speakerName: "Alice",
          speakerUserId: "private-speaker-user-id",
          speakerImage: null,
        },
        {
          id: "private-message-id-4",
          originalText: "Unidentified diarized turn",
          originalLang: "en",
          targetLanguages: [],
          translations: {},
          translationFinalized: {},
          createdAtMs: 4,
          speaker: "Speaker 1",
          speakerAvatarSeed: "seed",
          speakerAvatarIndex: 0,
          speakerName: null,
          speakerUserId: null,
          speakerImage: null,
        },
      ],
      leaveNotices: [{ userId: "private-leave-user-id", name: "Leaver", handle: "leaver", leftAtMs: 2 }],
      sharedByUserId: "user-owner",
    });

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/shared/tok-a"),
      { params: Promise.resolve({ shareToken: "tok-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);

    // No account id value survives anywhere in the payload, at any depth.
    const stringValues = collectStringValues(json);
    for (const userId of FIXTURE_USER_IDS) {
      expect(stringValues).not.toContain(userId);
      expect(JSON.stringify(json)).not.toContain(userId);
    }

    // And no field even claims to be one, so a future field named *UserId
    // cannot quietly reintroduce the leak.
    for (const key of collectKeys(json)) {
      expect(key.toLowerCase()).not.toContain("userid");
    }

    // Aliases are stable within one response and assigned by first appearance,
    // so bubbles still group by speaker without an identity to correlate.
    const aliases = (json.utterances as Array<{ speakerAlias: string | null }>).map((u) => u.speakerAlias);
    expect(aliases).toEqual(["s1", "s2", "s1", null]);
  });

  it("omits the sharer card when the sharer's profile cannot be resolved", async () => {
    mockGetUserProfile.mockResolvedValue(null);
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
    expect(json.sharedBy).toBeNull();
  });

  it("returns not_found for a disabled, rotated-away, or unknown share token", async () => {
    mockGetConversationHydrationStateForShare.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/shared/tok-a"),
      { params: Promise.resolve({ shareToken: "tok-a" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    // A dead token must not even cost a profile lookup.
    expect(mockGetUserProfile).not.toHaveBeenCalled();
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
