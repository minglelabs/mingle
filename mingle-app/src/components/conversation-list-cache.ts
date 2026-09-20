"use client";

import { getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";
import type { ConversationChannelSummary } from "@/lib/app-conversations";

const CONVERSATION_LIST_CACHE_KEY_PREFIX = "mingle:conversation-list-cache:v2";
const CONVERSATION_LIST_CACHE_MAX_STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CachedConversationLocalStats = {
  usageSec: number;
  messageCount: number;
};

export type ConversationListCacheIdentity = {
  apiNamespace: string;
  authenticatedUserId?: string;
  externalUserId?: string;
};

export type ConversationListCacheRecord = {
  savedAt: number;
  conversations: ConversationChannelSummary[];
  localStats: Record<string, CachedConversationLocalStats>;
};

export type ConversationListInitialState = {
  conversations: ConversationChannelSummary[];
  localStats: Record<string, CachedConversationLocalStats>;
  hasSnapshot: boolean;
  timeLabelsReady: boolean;
};

const conversationListMemoryCache = new Map<string, ConversationListCacheRecord>();

export function resolveConversationListInitialState(args: {
  initialConversations: ConversationChannelSummary[];
  initialConversationsRequireRefresh: boolean;
  warmSnapshot: ConversationListCacheRecord | null;
}): ConversationListInitialState {
  const warmSnapshot = args.initialConversations.length === 0
    ? args.warmSnapshot
    : null;
  const conversations = args.initialConversations.length > 0
    ? args.initialConversations
    : warmSnapshot?.conversations ?? args.initialConversations;

  return {
    conversations,
    localStats: warmSnapshot?.localStats ?? {},
    hasSnapshot: conversations.length > 0
      || warmSnapshot !== null
      || !args.initialConversationsRequireRefresh,
    timeLabelsReady: warmSnapshot !== null,
  };
}

function normalizeCacheIdentity(identity: ConversationListCacheIdentity): string {
  const authenticatedUserId = (identity.authenticatedUserId || "").trim();
  if (authenticatedUserId) {
    return `user:${authenticatedUserId}`;
  }

  const externalUserId = (identity.externalUserId || "").trim() || getOrCreateTrackingUserId();
  return `tracking:${externalUserId}`;
}

function buildConversationListCacheKey(identity: ConversationListCacheIdentity): string {
  const namespace = identity.apiNamespace.trim() || "default";
  return `${CONVERSATION_LIST_CACHE_KEY_PREFIX}:${encodeURIComponent(namespace)}:${encodeURIComponent(normalizeCacheIdentity(identity))}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === null || typeof value === "undefined" || typeof value === "string";
}

function isNullableInteger(value: unknown): value is number | null | undefined {
  return value === null
    || typeof value === "undefined"
    || (typeof value === "number" && Number.isInteger(value));
}

function isCachedConversationSummary(value: unknown): value is ConversationChannelSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Partial<ConversationChannelSummary>;
  return typeof candidate.id === "string"
    && typeof candidate.sequenceNumber === "number"
    && Number.isInteger(candidate.sequenceNumber)
    && typeof candidate.title === "string"
    && typeof candidate.sessionKey === "string"
    && (candidate.status === "active" || candidate.status === "paused")
    && isStringArray(candidate.selectedLanguages)
    && isStringArray(candidate.speechLanguages)
    && typeof candidate.translationLanguagesLinked === "boolean"
    && isNullableString(candidate.latestMessagePreview)
    && isNullableString(candidate.latestMessageAt)
    && isNullableString(candidate.latestSpeaker)
    && isNullableString(candidate.latestSpeakerAvatarSeed)
    && isNullableInteger(candidate.latestSpeakerAvatarIndex)
    && (
      typeof candidate.messageCount === "undefined"
      || (typeof candidate.messageCount === "number" && Number.isFinite(candidate.messageCount))
    )
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string"
    && (candidate.pausedAt === null || typeof candidate.pausedAt === "string");
}

function normalizeStatsValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function normalizeLocalStats(
  value: unknown,
  conversations: ConversationChannelSummary[],
): Record<string, CachedConversationLocalStats> {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const normalized: Record<string, CachedConversationLocalStats> = {};

  for (const conversation of conversations) {
    const candidate = source[conversation.id];
    const stats = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as Partial<CachedConversationLocalStats>
      : {};
    normalized[conversation.id] = {
      usageSec: normalizeStatsValue(stats.usageSec),
      messageCount: normalizeStatsValue(stats.messageCount),
    };
  }

  return normalized;
}

function normalizeCacheRecord(value: unknown, now = Date.now()): ConversationListCacheRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Partial<ConversationListCacheRecord>;
  if (
    typeof candidate.savedAt !== "number"
    || !Number.isFinite(candidate.savedAt)
    || candidate.savedAt > now + 60_000
    || now - candidate.savedAt > CONVERSATION_LIST_CACHE_MAX_STALE_AGE_MS
    || !Array.isArray(candidate.conversations)
    || !candidate.conversations.every(isCachedConversationSummary)
  ) {
    return null;
  }

  return {
    savedAt: candidate.savedAt,
    conversations: candidate.conversations,
    localStats: normalizeLocalStats(candidate.localStats, candidate.conversations),
  };
}

export function readConversationListMemoryCache(
  identity: ConversationListCacheIdentity,
): ConversationListCacheRecord | null {
  if (typeof window === "undefined") return null;

  const storageKey = buildConversationListCacheKey(identity);
  const cached = normalizeCacheRecord(conversationListMemoryCache.get(storageKey));
  if (cached) return cached;

  conversationListMemoryCache.delete(storageKey);
  return null;
}

export function readConversationListCache(
  identity: ConversationListCacheIdentity,
): ConversationListCacheRecord | null {
  if (typeof window === "undefined") return null;

  const storageKey = buildConversationListCacheKey(identity);
  const memoryCached = readConversationListMemoryCache(identity);
  if (memoryCached) return memoryCached;

  const storageNames = ["localStorage", "sessionStorage"] as const;
  for (const storageName of storageNames) {
    try {
      const storage = window[storageName];
      const rawValue = storage.getItem(storageKey);
      if (!rawValue) continue;

      const cached = normalizeCacheRecord(JSON.parse(rawValue));
      if (!cached) {
        storage.removeItem(storageKey);
        continue;
      }

      conversationListMemoryCache.set(storageKey, cached);
      if (storageName === "sessionStorage") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(cached));
        } catch {
          // Keep using the valid session snapshot when durable storage is restricted.
        }
      }
      return cached;
    } catch {
      // Try the next browser storage tier.
    }
  }

  return null;
}

export function writeConversationListCache(
  identity: ConversationListCacheIdentity,
  conversations: ConversationChannelSummary[],
  localStats: Record<string, CachedConversationLocalStats>,
): void {
  if (typeof window === "undefined") return;

  const storageKey = buildConversationListCacheKey(identity);
  const cached: ConversationListCacheRecord = {
    savedAt: Date.now(),
    conversations,
    localStats: normalizeLocalStats(localStats, conversations),
  };
  conversationListMemoryCache.set(storageKey, cached);

  const serialized = JSON.stringify(cached);
  try {
    window.localStorage.setItem(storageKey, serialized);
    return;
  } catch {
    // Fall back to session storage when durable WebView storage is restricted.
  }

  try {
    window.sessionStorage.setItem(storageKey, serialized);
  } catch {
    // The in-memory snapshot still keeps tab re-entry warm when browser storage is restricted.
  }
}
