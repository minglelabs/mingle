import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockConversationFindFirst,
  mockConversationUpdateMany,
  mockMessageCount,
  mockMessageFindMany,
} = vi.hoisted(() => ({
  mockConversationFindFirst: vi.fn(),
  mockConversationUpdateMany: vi.fn(),
  mockMessageCount: vi.fn(),
  mockMessageFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appConversationChannel: {
      findFirst: mockConversationFindFirst,
      updateMany: mockConversationUpdateMany,
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

  beforeEach(() => {
    vi.clearAllMocks();
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
    mockConversationUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("replaces a room title with a summary after its tenth finalized turn", async () => {
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

    expect(mockConversationUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "conversation-1", autoTitleGeneratedAt: null, autoTitleLastTurnCount: null },
      data: {
        autoTitleGeneratedAt: expect.any(Date),
        autoTitleLastTurnCount: AUTO_CONVERSATION_TITLE_TURN_COUNT,
      },
    });
    expect(mockConversationUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "conversation-1", userEditedTitleAt: null },
      data: { title: "Saturday hiking trip plans" },
    });
  });

  it("skips the AI when a parallel write already claimed this round", async () => {
    mockConversationUpdateMany.mockResolvedValueOnce({ count: 0 });
    const generateTitle = vi.fn(async () => "Saturday hiking trip plans");

    await maybeGenerateConversationTitleForSession({ sessionKey: "session-1", generateTitle });

    expect(generateTitle).not.toHaveBeenCalled();
    expect(mockConversationUpdateMany).toHaveBeenCalledOnce();
  });

  it("keeps the claim when the AI fails, so the next message does not retry", async () => {
    const generateTitle = vi.fn(async () => null);

    await maybeGenerateConversationTitleForSession({ sessionKey: "session-1", generateTitle });

    expect(generateTitle).toHaveBeenCalledOnce();
    expect(mockConversationUpdateMany).toHaveBeenCalledOnce();
    expect(mockConversationUpdateMany.mock.calls[0][0].data.autoTitleLastTurnCount).toBe(AUTO_CONVERSATION_TITLE_TURN_COUNT);
  });
});
