import { describe, it, expect, beforeEach, vi } from "vitest";

// Regression coverage for the PR #230 invite/share-join capacity race:
// inviteMembersToConversationChannel used to compute dedupe + capacity from an
// UNLOCKED pre-read and then, inside its transaction, write
// `[...existing.pendingInviteeUserIds, ...newInviteeUserIds]` from that stale
// read with no row lock — so a share-join that took the last seat (or mutated
// pending) in between could push the room over MAX_CONVERSATION_MEMBERS or
// resurrect a member who had just joined via the link. The fix re-reads and
// re-checks under the same `... FOR UPDATE` lock joinConversationChannelViaShareToken
// uses. These tests are in a separate file (not app-conversations.test.ts) to
// avoid merge conflicts with the concurrent share-toggle worker.

const {
  mockFindConversationFirst,
  mockUpdateConversation,
  mockChannelMemberFindMany,
  mockChannelInviteCreateMany,
  mockUserFindMany,
  mockUserBlockFindFirst,
  mockUserBlockFindMany,
  mockQueryRaw,
  mockAppMessageFindMany,
  mockAppMessageGroupBy,
} = vi.hoisted(() => ({
  mockFindConversationFirst: vi.fn(),
  mockUpdateConversation: vi.fn(),
  mockChannelMemberFindMany: vi.fn(),
  mockChannelInviteCreateMany: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserBlockFindFirst: vi.fn(),
  mockUserBlockFindMany: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockAppMessageFindMany: vi.fn(),
  mockAppMessageGroupBy: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    appConversationChannel: {
      findFirst: mockFindConversationFirst,
      update: mockUpdateConversation,
    },
    appConversationChannelMember: {
      findMany: mockChannelMemberFindMany,
    },
    appConversationChannelInvite: {
      createMany: mockChannelInviteCreateMany,
    },
    user: {
      findMany: mockUserFindMany,
    },
    userBlock: {
      findFirst: mockUserBlockFindFirst,
      findMany: mockUserBlockFindMany,
    },
    appMessage: {
      findMany: mockAppMessageFindMany,
      groupBy: mockAppMessageGroupBy,
    },
    // Execute the interactive-transaction callback against the same prisma
    // mock — the tx client and the base client share these mocks, so the code
    // under test hits the same doubles inside and outside the transaction.
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    $queryRaw: mockQueryRaw,
  };
  return { prisma };
});

vi.mock("@/lib/stt-languages", () => ({
  sanitizeSttLanguageSelection: (value: unknown) => (Array.isArray(value) ? value : []),
  deriveDefaultSttLanguagesForLocale: (locale: string) => [locale || "en"],
}));

vi.mock("@/i18n/conversations", () => ({
  formatLocalizedConversationTitle: (sequenceNumber: number, locale: string) => `${locale}:${sequenceNumber}`,
}));

import { inviteMembersToConversationChannel } from "@/lib/app-conversations";

// Minimal member row shape listChannelMembersByChannelId / the tx read consume.
function memberRow(userId: string, leftAt: Date | null = null) {
  return {
    channelId: "conv-1",
    userId,
    leftAt,
    selectedLanguages: ["en"],
    user: { name: userId, handle: userId },
  };
}

const conversationUpdateResult = {
  id: "conv-1",
  sequenceNumber: 1,
  title: "Conversation (1)",
  status: "active",
  sessionKey: "session-1",
  selectedLanguages: ["en"],
  speechLanguages: ["en"],
  translationLanguagesLinked: true,
  pendingInviteeUserIds: [],
  createdAt: new Date("2026-04-12T08:00:00.000Z"),
  updatedAt: new Date("2026-04-12T08:00:00.000Z"),
  pausedAt: null,
  userEditedTitleAt: null,
};

describe("inviteMembersToConversationChannel — capacity/pending race under lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppMessageFindMany.mockResolvedValue([]);
    mockAppMessageGroupBy.mockResolvedValue([]);
    mockQueryRaw.mockResolvedValue([]);
    mockChannelInviteCreateMany.mockResolvedValue({ count: 0 });
    mockUserBlockFindFirst.mockResolvedValue(null);
    mockUserBlockFindMany.mockResolvedValue([]);
    mockUpdateConversation.mockResolvedValue(conversationUpdateResult);
  });

  // (a) The unlocked pre-read sees 9 active members, but the locked re-read
  // inside the transaction sees 10 (a concurrent share-join committed as the
  // 10th between the two reads). The authoritative locked check must throw
  // too_many_invitees and write nothing.
  it("throws too_many_invitees when the locked read shows the room already full, writing nothing", async () => {
    const nineActive = Array.from({ length: 9 }, (_, i) => memberRow(`m-${i + 1}`));
    const tenActive = Array.from({ length: 10 }, (_, i) => memberRow(`m-${i + 1}`));

    // Pre-read (unlocked) then locked re-read (inside tx).
    mockFindConversationFirst
      .mockResolvedValueOnce({ id: "conv-1", pendingInviteeUserIds: [] })
      .mockResolvedValueOnce({ id: "conv-1", pendingInviteeUserIds: [] });
    // First members read = pre-check (9 active); second = locked read (10 active).
    mockChannelMemberFindMany
      .mockResolvedValueOnce(nineActive)
      .mockResolvedValueOnce(tenActive);
    mockUserFindMany.mockResolvedValue([{ id: "invitee-x" }]);

    await expect(
      inviteMembersToConversationChannel({
        conversationId: "conv-1",
        userId: "m-1",
        inviteeUserIds: ["invitee-x"],
      }),
    ).rejects.toThrow("too_many_invitees");

    // Rolled back inside the tx: no pending write, no invite-notice rows.
    expect(mockUpdateConversation).not.toHaveBeenCalled();
    expect(mockChannelInviteCreateMany).not.toHaveBeenCalled();
  });

  // (b) The written pending list is built from the LOCKED read, not the stale
  // pre-read:
  //  - a member who joined via the link meanwhile (dropped from pending, now an
  //    active member) is NOT resurrected into pending;
  //  - a pending entry added by a concurrent invite meanwhile is NOT dropped.
  it("builds the pending list from the locked read (no resurrection, no dropped concurrent pending)", async () => {
    // Pre-read: joiner still pending, no concurrent pending entry yet.
    mockFindConversationFirst
      .mockResolvedValueOnce({ id: "conv-1", pendingInviteeUserIds: ["joiner"] })
      // Locked read: joiner has joined (now active, gone from pending) and a
      // concurrent invite added "other-pending".
      .mockResolvedValueOnce({ id: "conv-1", pendingInviteeUserIds: ["other-pending"] });
    mockChannelMemberFindMany
      // Pre-check: owner only.
      .mockResolvedValueOnce([memberRow("owner")])
      // Locked read: owner + joiner (joiner materialized as an active member).
      .mockResolvedValueOnce([memberRow("owner"), memberRow("joiner")])
      // Post-commit serialize read (serializeConversationChannelWithPreview).
      .mockResolvedValue([memberRow("owner"), memberRow("joiner")]);
    mockUserFindMany.mockResolvedValue([{ id: "invitee-new" }]);

    await inviteMembersToConversationChannel({
      conversationId: "conv-1",
      userId: "owner",
      inviteeUserIds: ["invitee-new"],
    });

    // Written pending preserves the concurrently-added "other-pending" and does
    // NOT resurrect "joiner"; only the genuinely-new invitee is appended.
    expect(mockUpdateConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conv-1" },
        data: { pendingInviteeUserIds: ["other-pending", "invitee-new"] },
      }),
    );
    // Invite-notice rows stay consistent with the final new-invitee set.
    expect(mockChannelInviteCreateMany).toHaveBeenCalledWith({
      data: [{ channelId: "conv-1", inviteeUserId: "invitee-new", invitedByUserId: "owner" }],
      skipDuplicates: true,
    });
  });

  // (c) The FOR UPDATE lock query runs inside the transaction BEFORE the
  // capacity-bearing reads (the locked channel re-read and member re-read).
  it("runs the FOR UPDATE lock query before the capacity reads inside the transaction", async () => {
    const order: string[] = [];

    mockQueryRaw.mockImplementation(async () => {
      order.push("lock");
      return [];
    });
    mockFindConversationFirst
      .mockImplementationOnce(async () => {
        order.push("prelude-channel-read");
        return { id: "conv-1", pendingInviteeUserIds: [] };
      })
      .mockImplementationOnce(async () => {
        order.push("locked-channel-read");
        return { id: "conv-1", pendingInviteeUserIds: [] };
      });
    mockChannelMemberFindMany
      .mockImplementationOnce(async () => {
        order.push("prelude-member-read");
        return [memberRow("owner")];
      })
      .mockImplementationOnce(async () => {
        order.push("locked-member-read");
        return [memberRow("owner")];
      })
      // Post-commit serialize read — not part of the ordering assertion.
      .mockResolvedValue([memberRow("owner")]);
    mockUserFindMany.mockResolvedValue([{ id: "invitee-new" }]);

    await inviteMembersToConversationChannel({
      conversationId: "conv-1",
      userId: "owner",
      inviteeUserIds: ["invitee-new"],
    });

    const lockIndex = order.indexOf("lock");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    // The lock precedes BOTH capacity-bearing reads taken under it.
    expect(lockIndex).toBeLessThan(order.indexOf("locked-channel-read"));
    expect(lockIndex).toBeLessThan(order.indexOf("locked-member-read"));
  });
});
