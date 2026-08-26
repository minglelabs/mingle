import type { CSSProperties } from "react";

import type { ConversationChannelSummary } from "@/lib/app-conversations";

export const MAX_RECENT_SEARCHES = 6;
export const SEARCH_OVERLAY_HISTORY_STATE_KEY = "__mingleConversationSearchOpen";
export const CONVERSATION_HISTORY_ROUTE_STATE_KEY = "__MINGLE_CONVERSATION_HISTORY_ROUTE__";
export const ROW_ACTION_TOOLTIP_GAP_PX = 8;
export const ROW_ACTION_TOOLTIP_ESTIMATED_MAX_HEIGHT_PX = 200;
export const ROW_ACTION_TOOLTIP_FORCE_BELOW_VIEWPORT_RATIO = 0.4;

export const CONVERSATION_AVATAR_IMAGE_STYLE: CSSProperties & { WebkitUserDrag: string } = {
  WebkitUserDrag: "none",
  pointerEvents: "none",
};

export const CONVERSATION_ROW_TOUCH_SAFE_STYLE: CSSProperties = {
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
  userSelect: "none",
};

export type TooltipPos =
  | { side: "above"; bottom: number; left: number }
  | { side: "below"; top: number; left: number };

export type TooltipAnchorRect = {
  top: number;
  bottom: number;
  left: number;
  width: number;
};

export type ConversationCreateLockRef = {
  current: boolean;
};

export function tryAcquireConversationCreateLock(lockRef: ConversationCreateLockRef): boolean {
  if (lockRef.current) return false;
  lockRef.current = true;
  return true;
}

export function releaseConversationCreateLock(lockRef: ConversationCreateLockRef): void {
  lockRef.current = false;
}

export function resolveMountedConversationIds(
  activeConversationId: string | null | undefined,
  liveConversationId: string | null | undefined,
): string[] {
  const ids: string[] = [];
  if (liveConversationId) ids.push(liveConversationId);
  if (activeConversationId && activeConversationId !== liveConversationId) {
    ids.push(activeConversationId);
  }
  return ids;
}

export function normalizeSearchTerm(rawValue: string): string {
  return rawValue.trim().replace(/\s+/g, " ");
}

export function normalizeRecentSearches(values: string[]): string[] {
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = normalizeSearchTerm(value);
    if (!normalized) continue;
    if (deduped.some((item) => item.toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
      continue;
    }
    deduped.push(normalized);
    if (deduped.length >= MAX_RECENT_SEARCHES) break;
  }

  return deduped;
}

export function buildConversationRequestIdentityHeaders(input: {
  initialExternalUserId?: string;
  initialSessionKey?: string;
  fallbackExternalUserId: string;
  clientApiNamespace?: string;
}): Record<string, string> {
  const externalUserId = (input.initialExternalUserId || "").trim() || input.fallbackExternalUserId.trim();
  const sessionKey = (input.initialSessionKey || "").trim();
  const headers: Record<string, string> = {};

  if (externalUserId) {
    headers["x-mingle-user-id"] = externalUserId;
  }
  if (sessionKey) {
    headers["x-mingle-session-key"] = sessionKey;
  }
  if (input.clientApiNamespace) {
    headers["x-mingle-api-namespace"] = input.clientApiNamespace;
  }

  return headers;
}

export function mergeSearchOverlayHistoryState(state: unknown, open: boolean): Record<string, unknown> {
  const nextState = state && typeof state === "object" && !Array.isArray(state)
    ? { ...(state as Record<string, unknown>) }
    : {};

  if (open) {
    nextState[SEARCH_OVERLAY_HISTORY_STATE_KEY] = true;
  } else {
    delete nextState[SEARCH_OVERLAY_HISTORY_STATE_KEY];
  }

  return nextState;
}

export function isSearchOverlayHistoryOpen(state: unknown): boolean {
  return Boolean(
    state
    && typeof state === "object"
    && !Array.isArray(state)
    && (state as Record<string, unknown>)[SEARCH_OVERLAY_HISTORY_STATE_KEY] === true,
  );
}

function isMergeableHistoryState(state: unknown): state is Record<string, unknown> {
  return state !== null && typeof state === "object" && !Array.isArray(state);
}

export function readConversationHistoryRouteFromState(state: unknown): string | null | undefined {
  if (!isMergeableHistoryState(state)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(state, CONVERSATION_HISTORY_ROUTE_STATE_KEY)) {
    return undefined;
  }

  const rawRoute = state[CONVERSATION_HISTORY_ROUTE_STATE_KEY];
  if (typeof rawRoute !== "string") return null;
  const normalizedRoute = rawRoute.trim();
  return normalizedRoute || null;
}

export function resolveConversationHistoryRoute(
  eventState: unknown,
  currentState: unknown,
  fallbackRoute: string | null,
): string | null {
  // On iOS, a delayed popstate can carry the route from the gesture that
  // started earlier even after the WebView has already committed a later
  // forward entry. The current history entry is the authoritative route when
  // it has our marker; older entries fall back to the event state and URL.
  const currentRoute = readConversationHistoryRouteFromState(currentState);
  if (currentRoute !== undefined) return currentRoute;

  const eventRoute = readConversationHistoryRouteFromState(eventState);
  if (eventRoute !== undefined) return eventRoute;

  return fallbackRoute;
}

export type ConversationHistoryNavigationDirection = "back" | "forward" | "unknown";

export function resolveConversationHistoryNavigationDirection(
  activeConversationId: string | null,
  targetConversationId: string | null,
): ConversationHistoryNavigationDirection {
  if (activeConversationId && targetConversationId !== activeConversationId) {
    return "back";
  }
  if (!activeConversationId && targetConversationId) {
    return "forward";
  }
  return "unknown";
}

export function buildConversationHistoryState(
  conversationId: string | null,
  currentState: unknown,
): Record<string, unknown> {
  const nextState = isMergeableHistoryState(currentState)
    ? { ...currentState }
    : {};

  // The old plain field is only used by the first version of the room history
  // implementation. Remove it on list entries so a browser popstate cannot
  // mistake a list entry for a room after a stale iOS gesture replay.
  delete nextState.conversationId;
  nextState[CONVERSATION_HISTORY_ROUTE_STATE_KEY] = conversationId;
  if (conversationId) {
    nextState.conversationId = conversationId;
  }
  return nextState;
}

export function compareConversationRecency(a: ConversationChannelSummary, b: ConversationChannelSummary): number {
  const leftTimestamp = Date.parse(a.latestMessageAt || a.createdAt) || 0;
  const rightTimestamp = Date.parse(b.latestMessageAt || b.createdAt) || 0;
  return rightTimestamp - leftTimestamp;
}

function normalizeConversationMessageCount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

export function resolveConversationDisplayMessageCount(
  conversation: ConversationChannelSummary,
  localMessageCount: number,
): number {
  return Math.max(
    normalizeConversationMessageCount(conversation.messageCount),
    normalizeConversationMessageCount(localMessageCount),
  );
}

export function upsertConversation(
  conversations: ConversationChannelSummary[],
  nextConversation: ConversationChannelSummary,
): ConversationChannelSummary[] {
  const previousConversation = conversations.find((conversation) => conversation.id === nextConversation.id);
  const mergedConversation = previousConversation
    ? {
        ...previousConversation,
        ...nextConversation,
        latestMessagePreview:
          nextConversation.latestMessagePreview ?? previousConversation.latestMessagePreview,
        latestMessageAt:
          nextConversation.latestMessageAt ?? previousConversation.latestMessageAt,
        latestSpeaker:
          nextConversation.latestSpeaker ?? previousConversation.latestSpeaker,
        latestSpeakerAvatarSeed:
          nextConversation.latestSpeakerAvatarSeed ?? previousConversation.latestSpeakerAvatarSeed,
        latestSpeakerAvatarIndex:
          nextConversation.latestSpeakerAvatarIndex ?? previousConversation.latestSpeakerAvatarIndex,
      }
    : nextConversation;

  return [
    mergedConversation,
    ...conversations.filter((conversation) => conversation.id !== nextConversation.id),
  ].sort(compareConversationRecency);
}

export function updateConversationSummaryStatus(
  conversation: ConversationChannelSummary,
  status: "active" | "paused",
  nowIso = new Date().toISOString(),
): ConversationChannelSummary {
  return {
    ...conversation,
    status,
    pausedAt: status === "active" ? null : (conversation.pausedAt ?? nowIso),
    updatedAt: conversation.updatedAt,
  };
}

export function findNativeSttRestoreConversation(
  conversations: ConversationChannelSummary[],
  deletingConversationIds: ReadonlySet<string>,
): ConversationChannelSummary | null {
  return conversations.find((conversation) => (
    conversation.status === "active"
    && !deletingConversationIds.has(conversation.id)
  )) ?? null;
}

function areConversationValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => areConversationValuesEqual(value, right[index]));
  }
  if (
    !left
    || !right
    || typeof left !== "object"
    || typeof right !== "object"
  ) {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => (
    Object.prototype.hasOwnProperty.call(rightRecord, key)
    && areConversationValuesEqual(leftRecord[key], rightRecord[key])
  ));
}

export function areConversationListsEqual(
  left: ConversationChannelSummary[],
  right: ConversationChannelSummary[],
): boolean {
  return areConversationValuesEqual(left, right);
}

export function mergeConversationLists(
  current: ConversationChannelSummary[],
  incoming: ConversationChannelSummary[],
): ConversationChannelSummary[] {
  const merged = new Map<string, ConversationChannelSummary>();
  for (const conversation of current) {
    merged.set(conversation.id, conversation);
  }
  for (const conversation of incoming) {
    merged.set(conversation.id, conversation);
  }
  const next = [...merged.values()].sort(compareConversationRecency);
  return areConversationListsEqual(current, next) ? current : next;
}

export function replaceConversationLists(
  current: ConversationChannelSummary[],
  incoming: ConversationChannelSummary[],
): ConversationChannelSummary[] {
  const currentById = new Map(current.map((conversation) => [conversation.id, conversation]));
  const next = incoming.map((conversation) => {
    const previousConversation = currentById.get(conversation.id);
    if (!previousConversation) {
      return conversation;
    }
    return {
      ...previousConversation,
      ...conversation,
      latestMessagePreview:
        conversation.latestMessagePreview ?? previousConversation.latestMessagePreview,
      latestMessageAt:
        conversation.latestMessageAt ?? previousConversation.latestMessageAt,
      latestSpeaker:
        conversation.latestSpeaker ?? previousConversation.latestSpeaker,
      latestSpeakerAvatarSeed:
        conversation.latestSpeakerAvatarSeed ?? previousConversation.latestSpeakerAvatarSeed,
      latestSpeakerAvatarIndex:
        conversation.latestSpeakerAvatarIndex ?? previousConversation.latestSpeakerAvatarIndex,
    };
  }).sort(compareConversationRecency);
  return areConversationListsEqual(current, next) ? current : next;
}

export function calculateConversationRowTooltipPosForRect(
  rect: TooltipAnchorRect,
  viewportHeight: number,
): TooltipPos {
  const left = rect.left + rect.width / 2;
  const shouldForceBelow = rect.top <= viewportHeight * ROW_ACTION_TOOLTIP_FORCE_BELOW_VIEWPORT_RATIO;
  if (
    !shouldForceBelow
    && rect.top - ROW_ACTION_TOOLTIP_GAP_PX >= ROW_ACTION_TOOLTIP_ESTIMATED_MAX_HEIGHT_PX
  ) {
    return {
      side: "above",
      bottom: viewportHeight - rect.top + ROW_ACTION_TOOLTIP_GAP_PX,
      left,
    };
  }
  return {
    side: "below",
    top: rect.bottom + ROW_ACTION_TOOLTIP_GAP_PX,
    left,
  };
}

export type MutationVersionTracker<TKey> = {
  next: (key: TKey) => number;
  isLatest: (key: TKey, version: number) => boolean;
  current: (key: TKey) => number;
  reset: (key: TKey) => void;
};

export function createMutationVersionTracker<TKey>(): MutationVersionTracker<TKey> {
  const versions = new Map<TKey, number>();
  return {
    next(key) {
      const next = (versions.get(key) ?? 0) + 1;
      versions.set(key, next);
      return next;
    },
    isLatest(key, version) {
      return versions.get(key) === version;
    },
    current(key) {
      return versions.get(key) ?? 0;
    },
    reset(key) {
      versions.delete(key);
    },
  };
}
