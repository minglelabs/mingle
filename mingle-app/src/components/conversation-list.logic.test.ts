import { describe, expect, it } from "vitest";

import type { ConversationChannelSummary } from "@/lib/app-conversations";
import {
  buildConversationHistoryState,
  buildConversationRequestIdentityHeaders,
  calculateConversationRowTooltipPosForRect,
  compareConversationRecency,
  CONVERSATION_HISTORY_ROUTE_STATE_KEY,
  CONVERSATION_AVATAR_IMAGE_STYLE,
  CONVERSATION_ROW_TOUCH_SAFE_STYLE,
  createMutationVersionTracker,
  findNativeSttRestoreConversation,
  isConversationListRefreshCurrent,
  isSearchOverlayHistoryOpen,
  mergeConversationLists,
  mergeSearchOverlayHistoryState,
  normalizeRecentSearches,
  normalizeSearchTerm,
  replaceConversationLists,
  releaseConversationCreateLock,
  resolveMountedConversationIds,
  resolveConversationHistoryRoute,
  resolveConversationHistoryNavigationDirection,
  readConversationHistoryRouteFromState,
  resolveConversationDisplayMessageCount,
  SEARCH_OVERLAY_HISTORY_STATE_KEY,
  tryAcquireConversationCreateLock,
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
    isMultiMember: overrides.isMultiMember ?? false,
    isBlockedCounterpart: overrides.isBlockedCounterpart ?? false,
    otherMembers: overrides.otherMembers ?? [],
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
    messageCount: Object.prototype.hasOwnProperty.call(overrides, "messageCount")
      ? overrides.messageCount
      : undefined,
    createdAt: overrides.createdAt || "2026-04-12T09:00:00.000Z",
    updatedAt: overrides.updatedAt || "2026-04-12T10:00:00.000Z",
    pausedAt: Object.prototype.hasOwnProperty.call(overrides, "pausedAt")
      ? (overrides.pausedAt as string | null)
      : "2026-04-12T10:00:00.000Z",
  };
}

describe("conversation-list logic", () => {
  it("keeps the server-rendered tracking identity for client conversation refreshes", () => {
    expect(buildConversationRequestIdentityHeaders({
      initialExternalUserId: " cookie-user ",
      initialSessionKey: " cookie-session ",
      fallbackExternalUserId: "local-user",
      clientApiNamespace: "ios/v1.1.4",
    })).toEqual({
      "x-mingle-user-id": "cookie-user",
      "x-mingle-session-key": "cookie-session",
      "x-mingle-api-namespace": "ios/v1.1.4",
    });

    expect(buildConversationRequestIdentityHeaders({
      fallbackExternalUserId: "local-user",
    })).toEqual({
      "x-mingle-user-id": "local-user",
    });
  });

  it("locks conversation creation synchronously before React state updates", () => {
    const lockRef = { current: false };

    expect(tryAcquireConversationCreateLock(lockRef)).toBe(true);
    expect(lockRef.current).toBe(true);
    expect(tryAcquireConversationCreateLock(lockRef)).toBe(false);

    releaseConversationCreateLock(lockRef);

    expect(lockRef.current).toBe(false);
    expect(tryAcquireConversationCreateLock(lockRef)).toBe(true);
  });

  it("mounts a background live room below the currently visible room", () => {
    expect(resolveMountedConversationIds("room-visible", "room-live")).toEqual([
      "room-live",
      "room-visible",
    ]);
    expect(resolveMountedConversationIds("room-live", "room-live")).toEqual(["room-live"]);
    expect(resolveMountedConversationIds("room-visible", null)).toEqual(["room-visible"]);
  });

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

  it("prefers the committed history entry over a stale popstate route", () => {
    const roomState = buildConversationHistoryState("conv-1", {
      nativeIndex: 2,
    });
    const listState = buildConversationHistoryState(null, {
      nativeIndex: 1,
    });

    expect(resolveConversationHistoryRoute(listState, roomState, null)).toBe("conv-1");
    expect(resolveConversationHistoryRoute(null, listState, "conv-1")).toBeNull();
    expect(readConversationHistoryRouteFromState(roomState)).toBe("conv-1");
    expect(readConversationHistoryRouteFromState(listState)).toBeNull();
  });

  it("classifies room history transitions before React state catches up", () => {
    expect(resolveConversationHistoryNavigationDirection("conv-1", null)).toBe("back");
    expect(resolveConversationHistoryNavigationDirection(null, "conv-1")).toBe("forward");
    expect(resolveConversationHistoryNavigationDirection(null, null)).toBe("unknown");
    expect(resolveConversationHistoryNavigationDirection("conv-1", "conv-1")).toBe("unknown");
  });

  it("preserves unrelated history state while removing legacy room metadata from list entries", () => {
    expect(buildConversationHistoryState(null, {
      keep: true,
      conversationId: "legacy-room",
    })).toEqual({
      keep: true,
      [CONVERSATION_HISTORY_ROUTE_STATE_KEY]: null,
    });
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

  it("uses server message counts while preserving optimistic local counts", () => {
    expect(resolveConversationDisplayMessageCount(
      buildConversationSummary({ messageCount: 648 }),
      100,
    )).toBe(648);
    expect(resolveConversationDisplayMessageCount(
      buildConversationSummary({ messageCount: 648 }),
      650,
    )).toBe(650);
    expect(resolveConversationDisplayMessageCount(
      buildConversationSummary(),
      37,
    )).toBe(37);
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

  it("discards a list refresh when a room mutation changed while it was in flight", () => {
    expect(isConversationListRefreshCurrent({
      startedMutationRevision: 4,
      currentMutationRevision: 4,
    })).toBe(true);
    expect(isConversationListRefreshCurrent({
      startedMutationRevision: 4,
      currentMutationRevision: 5,
    })).toBe(false);
  });

  it("keeps the current list reference when a refresh contains no visible changes", () => {
    const current = [
      {
        ...buildConversationSummary({
        id: "conv-stable",
        otherMembers: [{
          userId: "user-2",
          name: "Mina",
          image: null,
          imageCropScale: null,
          imageCropX: null,
          imageCropY: null,
        }],
        }),
        selectedLanguagesAttribution: { ko: ["user-1"] },
      },
    ];
    const identicalPayload = current.map((conversation) => ({
      ...conversation,
      selectedLanguages: [...(conversation.selectedLanguages ?? [])],
      selectedLanguagesAttribution: { ko: ["user-1"] },
      otherMembers: conversation.otherMembers.map((member) => ({ ...member })),
    }));

    expect(mergeConversationLists(current, identicalPayload)).toBe(current);
    expect(replaceConversationLists(current, identicalPayload)).toBe(current);

    const changedPayload = [{
      ...identicalPayload[0],
      unreadMessageCount: 1,
    }];
    expect(replaceConversationLists(current, changedPayload)).not.toBe(current);
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

  it("finds the active conversation that should be restored after native STT remount", () => {
    const paused = buildConversationSummary({
      id: "conv-paused",
      status: "paused",
    });
    const deletingActive = buildConversationSummary({
      id: "conv-deleting",
      status: "active",
      pausedAt: null,
    });
    const live = buildConversationSummary({
      id: "conv-live",
      status: "active",
      pausedAt: null,
    });

    expect(findNativeSttRestoreConversation([
      paused,
      deletingActive,
      live,
    ], new Set(["conv-deleting"]))).toBe(live);
  });

  it("keeps a hidden live room mounted after the visible room closes", () => {
    expect(resolveMountedConversationIds(null, "conv-live")).toEqual(["conv-live"]);
    expect(resolveMountedConversationIds("conv-live", "conv-live")).toEqual(["conv-live"]);
    expect(resolveMountedConversationIds("conv-visible", "conv-live")).toEqual([
      "conv-live",
      "conv-visible",
    ]);
  });

  it("restores the cached native STT conversation instead of the first active room", () => {
    const firstActive = buildConversationSummary({
      id: "conv-first",
      status: "active",
      pausedAt: null,
    });
    const cachedActive = buildConversationSummary({
      id: "conv-cached",
      status: "active",
      pausedAt: null,
    });

    expect(findNativeSttRestoreConversation([
      firstActive,
      cachedActive,
    ], new Set(), "conv-cached")).toBe(cachedActive);
  });

  it("does not restore an unrelated active room when the cached owner is missing", () => {
    const active = buildConversationSummary({
      id: "conv-active",
      status: "active",
      pausedAt: null,
    });

    expect(findNativeSttRestoreConversation([
      active,
    ], new Set(), "conv-missing")).toBeNull();
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

describe("createMutationVersionTracker", () => {
  it("issues monotonically increasing versions per key", () => {
    const tracker = createMutationVersionTracker<string>();
    expect(tracker.next("a")).toBe(1);
    expect(tracker.next("a")).toBe(2);
    expect(tracker.next("b")).toBe(1);
    expect(tracker.next("a")).toBe(3);
    expect(tracker.next("b")).toBe(2);
  });

  it("isLatest reports true only for the most recently issued version", () => {
    const tracker = createMutationVersionTracker<string>();
    const v1 = tracker.next("conv-1");
    const v2 = tracker.next("conv-1");
    expect(tracker.isLatest("conv-1", v1)).toBe(false);
    expect(tracker.isLatest("conv-1", v2)).toBe(true);
  });

  it("treats unknown keys as having no latest version", () => {
    const tracker = createMutationVersionTracker<string>();
    expect(tracker.isLatest("conv-x", 1)).toBe(false);
    expect(tracker.current("conv-x")).toBe(0);
  });

  it("reset clears the version so the next issue starts at 1 again", () => {
    const tracker = createMutationVersionTracker<string>();
    tracker.next("conv-1");
    tracker.next("conv-1");
    tracker.reset("conv-1");
    expect(tracker.current("conv-1")).toBe(0);
    expect(tracker.next("conv-1")).toBe(1);
  });

  describe("status PATCH race scenarios", () => {
    // The fixed handler must follow this pattern:
    //   1. tracker.next(id) before issuing PATCH
    //   2. on resolution, only commit/rollback/alert if tracker.isLatest(id, version)
    // These tests document the exact behavior the production handler implements.

    type LocalState = "active" | "paused";
    type StatusOutcome =
      | { kind: "commit"; status: LocalState }
      | { kind: "rollback"; alert: boolean }
      | { kind: "stale-success" }
      | { kind: "stale-failure" }
      | { kind: "aborted" };

    function applyOutcome(
      tracker: ReturnType<typeof createMutationVersionTracker<string>>,
      conversationId: string,
      version: number,
      result:
        | { kind: "success"; serverStatus: LocalState }
        | { kind: "failure" }
        | { kind: "abort" },
    ): StatusOutcome {
      if (result.kind === "abort") return { kind: "aborted" };
      const latest = tracker.isLatest(conversationId, version);
      if (result.kind === "success") {
        if (!latest) return { kind: "stale-success" };
        return { kind: "commit", status: result.serverStatus };
      }
      if (!latest) return { kind: "stale-failure" };
      return { kind: "rollback", alert: true };
    }

    it("active starts, paused starts after, active resolves last → final state stays paused", () => {
      const tracker = createMutationVersionTracker<string>();
      const id = "conv-1";

      const activeVersion = tracker.next(id);
      const pausedVersion = tracker.next(id);

      // Server happens to respond paused first (both succeeded server-side).
      const pausedOutcome = applyOutcome(tracker, id, pausedVersion, {
        kind: "success",
        serverStatus: "paused",
      });
      // Then the older active response arrives.
      const activeOutcome = applyOutcome(tracker, id, activeVersion, {
        kind: "success",
        serverStatus: "active",
      });

      expect(pausedOutcome).toEqual({ kind: "commit", status: "paused" });
      expect(activeOutcome).toEqual({ kind: "stale-success" });
    });

    it("stale status PATCH failure does not rollback latest state and does not alert", () => {
      const tracker = createMutationVersionTracker<string>();
      const id = "conv-1";

      const activeVersion = tracker.next(id);
      tracker.next(id); // newer mutation supersedes the active one

      const outcome = applyOutcome(tracker, id, activeVersion, { kind: "failure" });
      expect(outcome).toEqual({ kind: "stale-failure" });
    });

    it("latest status PATCH failure rolls back and alerts once", () => {
      const tracker = createMutationVersionTracker<string>();
      const id = "conv-1";

      const onlyVersion = tracker.next(id);
      const outcome = applyOutcome(tracker, id, onlyVersion, { kind: "failure" });

      expect(outcome).toEqual({ kind: "rollback", alert: true });
    });

    it("aborted requests are silent regardless of latest-ness", () => {
      const tracker = createMutationVersionTracker<string>();
      const id = "conv-1";

      const abortedVersion = tracker.next(id);
      tracker.next(id);

      expect(applyOutcome(tracker, id, abortedVersion, { kind: "abort" })).toEqual({
        kind: "aborted",
      });
    });

    it("isolates versions per conversation so unrelated rooms do not invalidate each other", () => {
      const tracker = createMutationVersionTracker<string>();
      const v1A = tracker.next("conv-a");
      const v1B = tracker.next("conv-b");

      tracker.next("conv-a"); // newer mutation on A

      // A's first version is stale; B's first version is still latest.
      expect(tracker.isLatest("conv-a", v1A)).toBe(false);
      expect(tracker.isLatest("conv-b", v1B)).toBe(true);
    });
  });
});
