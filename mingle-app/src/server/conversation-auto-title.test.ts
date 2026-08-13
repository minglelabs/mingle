import { describe, expect, it, vi } from "vitest";

const {
  mockConversationFindFirst,
  mockConversationUpdate,
  mockMessageCount,
  mockMessageFindMany,
} = vi.hoisted(() => ({
  mockConversationFindFirst: vi.fn(),
  mockConversationUpdate: vi.fn(),
  mockMessageCount: vi.fn(),
  mockMessageFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appConversationChannel: {
      findFirst: mockConversationFindFirst,
      update: mockConversationUpdate,
    },
    appMessage: {
      count: mockMessageCount,
      findMany: mockMessageFindMany,
    },
  },
}));

import {
  AUTO_CONVERSATION_TITLE_TURN_COUNT,
  sanitizeGeneratedConversationTitle,
  shouldGenerateConversationTitle,
  maybeGenerateConversationTitleForSession,
} from "@/server/conversation-auto-title";

describe("conversation auto title", () => {
  it("generates and improves a title at exponentially spaced turn milestones", () => {
    expect(shouldGenerateConversationTitle({
      finalizedTurnCount: AUTO_CONVERSATION_TITLE_TURN_COUNT - 1,
      userEditedTitleAt: null,
      autoTitleGeneratedAt: null,
      autoTitleLastTurnCount: null,
    })).toBe(false);

    expect(shouldGenerateConversationTitle({
      finalizedTurnCount: AUTO_CONVERSATION_TITLE_TURN_COUNT,
      userEditedTitleAt: null,
      autoTitleGeneratedAt: null,
      autoTitleLastTurnCount: null,
    })).toBe(true);

    expect(shouldGenerateConversationTitle({
      finalizedTurnCount: AUTO_CONVERSATION_TITLE_TURN_COUNT + 1,
      userEditedTitleAt: null,
      autoTitleGeneratedAt: new Date(),
      autoTitleLastTurnCount: AUTO_CONVERSATION_TITLE_TURN_COUNT,
    })).toBe(false);
    expect(shouldGenerateConversationTitle({
      finalizedTurnCount: AUTO_CONVERSATION_TITLE_TURN_COUNT * 2,
      userEditedTitleAt: null,
      autoTitleGeneratedAt: new Date(),
      autoTitleLastTurnCount: AUTO_CONVERSATION_TITLE_TURN_COUNT,
    })).toBe(true);
    expect(shouldGenerateConversationTitle({
      finalizedTurnCount: AUTO_CONVERSATION_TITLE_TURN_COUNT,
      userEditedTitleAt: new Date(),
      autoTitleGeneratedAt: null,
      autoTitleLastTurnCount: null,
    })).toBe(false);
    expect(shouldGenerateConversationTitle({
      finalizedTurnCount: AUTO_CONVERSATION_TITLE_TURN_COUNT,
      userEditedTitleAt: null,
      autoTitleGeneratedAt: new Date(),
      autoTitleLastTurnCount: AUTO_CONVERSATION_TITLE_TURN_COUNT,
    })).toBe(false);
  });

  it("turns a model response into a short single-line room title", () => {
    expect(sanitizeGeneratedConversationTitle("  Weekend travel plans\nwith friends  "))
      .toBe("Weekend travel plans");
    expect(sanitizeGeneratedConversationTitle("Density Partners: Learnings"))
      .toBe("Density Partners:");
    expect(sanitizeGeneratedConversationTitle("R&D project")).toBe("R&D project");
    expect(sanitizeGeneratedConversationTitle("a".repeat(80))).toHaveLength(20);
    expect(sanitizeGeneratedConversationTitle("   ")).toBeNull();
  });

  it("replaces a room title with a summary after its tenth finalized turn", async () => {
    mockConversationFindFirst.mockResolvedValue({
      id: "conversation-1",
      userEditedTitleAt: null,
      autoTitleGeneratedAt: null,
      autoTitleLastTurnCount: null,
    });
    mockMessageCount.mockResolvedValue(AUTO_CONVERSATION_TITLE_TURN_COUNT);
    mockMessageFindMany.mockResolvedValue([
      { contents: [{ text: "Let's plan a hiking trip." }] },
      { contents: [{ text: "Saturday morning works for me." }] },
    ]);
    mockConversationUpdate.mockResolvedValue({});

    await maybeGenerateConversationTitleForSession({
      sessionKey: "session-1",
      generateTitle: async (turns) => {
        expect(turns).toEqual([
          "Let's plan a hiking trip.",
          "Saturday morning works for me.",
        ]);
        return "Saturday hiking trip plans";
      },
    });

    expect(mockConversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: expect.objectContaining({
        title: "Saturday hiking trip plans",
        autoTitleGeneratedAt: expect.any(Date),
        autoTitleLastTurnCount: AUTO_CONVERSATION_TITLE_TURN_COUNT,
      }),
    });
  });
});
