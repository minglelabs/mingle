import { describe, expect, it } from "vitest";

import type { ConversationChannelSummary } from "@/lib/app-conversations";
import {
  calculateConversationRowTooltipPosForRect,
  compareConversationRecency,
  CONVERSATION_AVATAR_IMAGE_STYLE,
  CONVERSATION_ROW_TOUCH_SAFE_STYLE,
  isSearchOverlayHistoryOpen,
  mergeConversationLists,
  mergeSearchOverlayHistoryState,
  normalizeRecentSearches,
  normalizeSearchTerm,
  replaceConversationLists,
  SEARCH_OVERLAY_HISTORY_STATE_KEY,
  upsertConversation,
  updateConversationSummaryStatus,
} from "@/components/conversation-list.logic";

function buildConversationSummary(
  overrides: Partial<ConversationChannelSummary> = {},
): ConversationChannelSummary {
  return {
    id: overrides.id || "conv-1",
    sequenceNumber: overrides.sequenceNumber ?? 1,
    title: overrides.title || "Conversation (1)",
    status: overrides.status || "paused",
    sessionKey: overrides.sessionKey || "session-1",
    selectedLanguages: overrides.selectedLanguages || ["en", "ko"],
    latestMessagePreview: Object.prototype.hasOwnProperty.call(overrides, "latestMessagePreview")
      ? overrides.latestMessagePreview
      : "hello",
    latestMessageAt: Object.prototype.hasOwnProperty.call(overrides, "latestMessageAt")
      ? overrides.latestMessageAt
      : "2026-04-12T10:00:00.000Z",
    latestSpeaker: Object.prototype.hasOwnProperty.call(overrides, "latestSpeaker")
      ? overrides.latestSpeaker
      : "speaker-1",
    latestSpeakerAvatarSeed: Object.prototype.hasOwnProperty.call(overrides, "latestSpeakerAvatarSeed")
      ? overrides.latestSpeakerAvatarSeed
      : "seed-1",
    latestSpeakerAvatarIndex: Object.prototype.hasOwnProperty.call(overrides, "latestSpeakerAvatarIndex")
      ? overrides.latestSpeakerAvatarIndex
      : 1,
    createdAt: overrides.createdAt || "2026-04-12T09:00:00.000Z",
    updatedAt: overrides.updatedAt || "2026-04-12T10:00:00.000Z",
    pausedAt: Object.prototype.hasOwnProperty.call(overrides, "pausedAt")
      ? overrides.pausedAt
      : "2026-04-12T10:00:00.000Z",
  };
}

describe("conversation-list logic", () => {
  it("normalizes search terms and recent searches case-insensitively", () => {
    expect(normalizeSearchTerm("  hello   world  ")).toBe("hello world");
    expect(normalizeRecentSearches([
      "  Seoul  trip ",
      "seoul trip",
      "",
      " Tokyo",
      "Osaka",
      "Busan",
      "Jeju",
      "Paris",
      "Berlin",
    ])).toEqual([
      "Seoul trip",
      "Tokyo",
      "Osaka",
      "Busan",
      "Jeju",
      "Paris",
    ]);
  });

  it("stores search overlay history in a dedicated single-step flag", () => {
    const opened = mergeSearchOverlayHistoryState({ foo: "bar" }, true);
    expect(opened).toEqual({
      foo: "bar",
      [SEARCH_OVERLAY_HISTORY_STATE_KEY]: true,
    });
    expect(isSearchOverlayHistoryOpen(opened)).toBe(true);

    const closed = mergeSearchOverlayHistoryState(opened, false);
    expect(closed).toEqual({ foo: "bar" });
    expect(isSearchOverlayHistoryOpen(closed)).toBe(false);
  });

  it("orders conversations by latest finalized message time before fallback timestamps", () => {
    const older = buildConversationSummary({
      id: "older",
      latestMessageAt: "2026-04-12T09:00:00.000Z",
      createdAt: "2026-04-12T08:00:00.000Z",
    });
    const newer = buildConversationSummary({
      id: "newer",
      latestMessageAt: "2026-04-12T11:00:00.000Z",
      createdAt: "2026-04-12T07:00:00.000Z",
    });

    expect(compareConversationRecency(newer, older)).toBeLessThan(0);
    expect(compareConversationRecency(older, newer)).toBeGreaterThan(0);
  });

  it("upserts a single conversation without dropping preview metadata from partial patches", () => {
    const current = [
      buildConversationSummary({
        id: "conv-a",
        latestMessagePreview: "latest preview",
        latestMessageAt: "2026-04-12T11:00:00.000Z",
      }),
      buildConversationSummary({
        id: "conv-b",
        sessionKey: "session-2",
        sequenceNumber: 2,
        latestMessagePreview: "older preview",
        latestMessageAt: "2026-04-12T10:00:00.000Z",
      }),
    ];

    const next = buildConversationSummary({
      id: "conv-b",
      sessionKey: "session-2",
      sequenceNumber: 2,
      latestMessagePreview: undefined,
      latestMessageAt: undefined,
      latestSpeaker: undefined,
      latestSpeakerAvatarSeed: undefined,
      latestSpeakerAvatarIndex: undefined,
      updatedAt: "2026-04-12T11:30:00.000Z",
    });

    expect(upsertConversation(current, next)).toEqual([
      expect.objectContaining({
        id: "conv-a",
      }),
      expect.objectContaining({
        id: "conv-b",
        latestMessagePreview: "older preview",
        latestMessageAt: "2026-04-12T10:00:00.000Z",
      }),
    ]);
  });

  it("merges and replaces conversation lists without blanking previews or live metadata", () => {
    const current = [
      buildConversationSummary({
        id: "conv-a",
        latestMessagePreview: "hello there",
        latestMessageAt: "2026-04-12T11:00:00.000Z",
        status: "active",
        pausedAt: null,
      }),
      buildConversationSummary({
        id: "conv-b",
        sessionKey: "session-2",
        sequenceNumber: 2,
        latestMessagePreview: "older row",
        latestMessageAt: "2026-04-12T10:00:00.000Z",
      }),
    ];
    const incoming = [
      buildConversationSummary({
        id: "conv-b",
        sessionKey: "session-2",
        sequenceNumber: 2,
        latestMessagePreview: undefined,
        latestMessageAt: undefined,
        status: "paused",
      }),
      buildConversationSummary({
        id: "conv-c",
        sessionKey: "session-3",
        sequenceNumber: 3,
        latestMessagePreview: "brand new",
        latestMessageAt: "2026-04-12T12:00:00.000Z",
      }),
    ];

    expect(mergeConversationLists(current, incoming)).toEqual([
      expect.objectContaining({ id: "conv-c" }),
      expect.objectContaining({
        id: "conv-a",
        latestMessagePreview: "hello there",
      }),
      expect.objectContaining({
        id: "conv-b",
        latestMessagePreview: undefined,
      }),
    ]);

    expect(replaceConversationLists(current, incoming)).toEqual([
      expect.objectContaining({
        id: "conv-c",
        latestMessagePreview: "brand new",
      }),
      expect.objectContaining({
        id: "conv-b",
        latestMessagePreview: "older row",
        latestMessageAt: "2026-04-12T10:00:00.000Z",
      }),
    ]);
  });

  it("updates active and paused summary state without losing pause timestamps", () => {
    const current = buildConversationSummary({
      id: "conv-live",
      status: "active",
      pausedAt: null,
    });

    expect(updateConversationSummaryStatus(current, "paused", "2026-04-12T12:34:56.000Z")).toEqual(
      expect.objectContaining({
        id: "conv-live",
        status: "paused",
        pausedAt: "2026-04-12T12:34:56.000Z",
      }),
    );

    expect(updateConversationSummaryStatus({
      ...current,
      status: "paused",
      pausedAt: "2026-04-12T12:00:00.000Z",
    }, "active")).toEqual(expect.objectContaining({
      id: "conv-live",
      status: "active",
      pausedAt: null,
    }));
  });

  it("keeps row actions touch-safe and avatar long-press safe", () => {
    expect(CONVERSATION_ROW_TOUCH_SAFE_STYLE).toEqual({
      WebkitTouchCallout: "none",
      WebkitUserSelect: "none",
      userSelect: "none",
    });
    expect(CONVERSATION_AVATAR_IMAGE_STYLE).toEqual({
      WebkitUserDrag: "none",
      pointerEvents: "none",
    });
  });

  it("opens action tooltips downward near the top and upward lower in the list", () => {
    expect(calculateConversationRowTooltipPosForRect({
      top: 120,
      bottom: 176,
      left: 32,
      width: 280,
    }, 800)).toEqual({
      side: "below",
      top: 184,
      left: 172,
    });

    expect(calculateConversationRowTooltipPosForRect({
      top: 520,
      bottom: 576,
      left: 40,
      width: 280,
    }, 800)).toEqual({
      side: "above",
      bottom: 288,
      left: 180,
    });
  });
});
