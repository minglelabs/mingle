import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConversationChannelSummary } from "@/lib/app-conversations";

type ConversationListCacheModule = typeof import("@/components/conversation-list-cache");

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function buildConversation(): ConversationChannelSummary {
  return {
    id: "conv-1",
    sequenceNumber: 1,
    title: "Team sync",
    status: "paused",
    sessionKey: "session-1",
    isMultiMember: false,
    isBlockedCounterpart: false,
    otherMembers: [],
    messageCount: 431,
    selectedLanguages: ["ko", "en"],
    speechLanguages: ["ko", "en"],
    translationLanguagesLinked: true,
    latestMessagePreview: "See you tomorrow",
    latestMessageAt: "2026-08-15T12:10:00.000Z",
    latestSpeaker: "speaker-2",
    latestSpeakerAvatarSeed: "avatar-seed-2",
    latestSpeakerAvatarIndex: 7,
    createdAt: "2026-08-14T01:00:00.000Z",
    updatedAt: "2026-08-15T12:10:00.000Z",
    pausedAt: "2026-08-15T12:11:00.000Z",
  };
}

describe("conversation list cache", () => {
  let cache: ConversationListCacheModule;
  let localStorage: Storage;
  let sessionStorage: Storage;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:30:00.000Z"));
    localStorage = createStorage();
    sessionStorage = createStorage();
    vi.stubGlobal("window", {
      localStorage,
      sessionStorage,
    });
    vi.resetModules();
    cache = await import("@/components/conversation-list-cache");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps every visible conversation-row field and local STT stats", () => {
    const identity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-1",
    };
    const conversation = buildConversation();
    const localStats = {
      "conv-1": {
        usageSec: 3_721,
        messageCount: 433,
      },
    };

    cache.writeConversationListCache(identity, [conversation], localStats);

    expect(cache.readConversationListMemoryCache(identity)).toEqual({
      savedAt: Date.now(),
      conversations: [conversation],
      localStats,
    });
  });

  it("uses a complete warm snapshot as the first render instead of a loading state", () => {
    const conversation = buildConversation();
    const warmSnapshot = {
      savedAt: Date.now(),
      conversations: [conversation],
      localStats: {
        "conv-1": { usageSec: 3_721, messageCount: 433 },
      },
    };

    expect(cache.resolveConversationListInitialState({
      initialConversations: [],
      initialConversationsRequireRefresh: true,
      warmSnapshot,
    })).toEqual({
      conversations: [conversation],
      localStats: warmSnapshot.localStats,
      hasSnapshot: true,
      timeLabelsReady: true,
    });
  });

  it("treats a cached empty list as a valid first-render snapshot", () => {
    expect(cache.resolveConversationListInitialState({
      initialConversations: [],
      initialConversationsRequireRefresh: true,
      warmSnapshot: {
        savedAt: Date.now(),
        conversations: [],
        localStats: {},
      },
    })).toEqual({
      conversations: [],
      localStats: {},
      hasSnapshot: true,
      timeLabelsReady: true,
    });
  });

  it("restores the snapshot from durable local storage after the module memory is recreated", async () => {
    const identity = {
      apiNamespace: "android/v2.0.0",
      authenticatedUserId: "user-2",
    };
    const conversation = buildConversation();
    cache.writeConversationListCache(identity, [conversation], {
      "conv-1": { usageSec: 120, messageCount: 431 },
    });

    vi.resetModules();
    const reloadedCache = await import("@/components/conversation-list-cache");

    expect(reloadedCache.readConversationListMemoryCache(identity)).toBeNull();
    expect(reloadedCache.readConversationListCache(identity)).toEqual({
      savedAt: Date.now(),
      conversations: [conversation],
      localStats: {
        "conv-1": { usageSec: 120, messageCount: 431 },
      },
    });
  });

  it("migrates a valid legacy session snapshot into durable local storage", async () => {
    const identity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-session-migration",
    };
    cache.writeConversationListCache(identity, [buildConversation()], {});
    const storageKey = localStorage.key(0);
    expect(storageKey).not.toBeNull();
    const serialized = localStorage.getItem(storageKey!);
    localStorage.removeItem(storageKey!);
    sessionStorage.setItem(storageKey!, serialized!);

    vi.resetModules();
    const reloadedCache = await import("@/components/conversation-list-cache");

    expect(reloadedCache.readConversationListCache(identity)?.conversations).toEqual([buildConversation()]);
    expect(localStorage.getItem(storageKey!)).toBe(serialized);
  });

  it("separates snapshots by authenticated user and API namespace", () => {
    const conversation = buildConversation();
    cache.writeConversationListCache({
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-a",
    }, [conversation], {});

    expect(cache.readConversationListMemoryCache({
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-b",
    })).toBeNull();
    expect(cache.readConversationListMemoryCache({
      apiNamespace: "ios/v1.1.4",
      authenticatedUserId: "user-a",
    })).toBeNull();
  });

  it("drops a stale stored snapshot instead of retaining it indefinitely", async () => {
    const identity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-stale",
    };
    cache.writeConversationListCache(identity, [buildConversation()], {});
    expect(localStorage.length).toBe(1);

    vi.setSystemTime(new Date("2026-08-23T12:30:00.000Z"));
    vi.resetModules();
    const reloadedCache = await import("@/components/conversation-list-cache");

    expect(reloadedCache.readConversationListCache(identity)).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
