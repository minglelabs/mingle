import type { CSSProperties } from "react";

import type { ConversationChannelSummary } from "@/lib/app-conversations";

export const MAX_RECENT_SEARCHES = 6;
export const SEARCH_OVERLAY_HISTORY_STATE_KEY = "__mingleConversationSearchOpen";
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

export function compareConversationRecency(a: ConversationChannelSummary, b: ConversationChannelSummary): number {
  const leftTimestamp = Date.parse(a.latestMessageAt || a.createdAt) || 0;
  const rightTimestamp = Date.parse(b.latestMessageAt || b.createdAt) || 0;
  return rightTimestamp - leftTimestamp;
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
  return [...merged.values()].sort(compareConversationRecency);
}

export function replaceConversationLists(
  current: ConversationChannelSummary[],
  incoming: ConversationChannelSummary[],
): ConversationChannelSummary[] {
  const currentById = new Map(current.map((conversation) => [conversation.id, conversation]));
  return incoming.map((conversation) => {
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
