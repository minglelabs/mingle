import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ConversationMemberProfileCacheModule = typeof import("@/components/conversation-member-profile-cache");

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

function buildMember(userId: string, image: string | null = `https://example.com/${userId}.png`) {
  return {
    userId,
    image,
    imageCropScale: 1.2,
    imageCropX: 0.1,
    imageCropY: -0.2,
    name: `User ${userId}`,
  };
}

describe("conversation member profile cache", () => {
  let cache: ConversationMemberProfileCacheModule;
  let localStorage: Storage;
  let sessionStorage: Storage;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T04:00:00.000Z"));
    localStorage = createStorage();
    sessionStorage = createStorage();
    vi.stubGlobal("window", { localStorage, sessionStorage });
    vi.resetModules();
    cache = await import("@/components/conversation-member-profile-cache");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("restores member profiles from durable storage after module recreation", async () => {
    const identity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-1",
      conversationId: "conversation-1",
    };
    const members = [buildMember("user-1"), buildMember("user-2")];

    cache.writeConversationMemberProfileCache(identity, members);

    vi.resetModules();
    const reloadedCache = await import("@/components/conversation-member-profile-cache");

    expect(reloadedCache.readConversationMemberProfileMemoryCache(identity)).toBeNull();
    expect(reloadedCache.readConversationMemberProfileCache(identity)).toEqual({
      savedAt: Date.now(),
      members,
    });
  });

  it("isolates snapshots by account, API namespace, and conversation", () => {
    const identity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-a",
      conversationId: "conversation-a",
    };

    cache.writeConversationMemberProfileCache(identity, [buildMember("user-a")]);

    expect(cache.readConversationMemberProfileMemoryCache({
      ...identity,
      authenticatedUserId: "user-b",
    })).toBeNull();
    expect(cache.readConversationMemberProfileMemoryCache({
      ...identity,
      apiNamespace: "android/v2.0.0",
    })).toBeNull();
    expect(cache.readConversationMemberProfileMemoryCache({
      ...identity,
      conversationId: "conversation-b",
    })).toBeNull();
  });

  it("lets fresh room snapshot members override cached profiles while retaining missing members", () => {
    const cachedMember = buildMember("user-1", "https://example.com/old.png");
    const freshMember = buildMember("user-1", "https://example.com/new.png");

    expect(cache.mergeConversationMemberProfiles(
      [cachedMember, buildMember("user-2")],
      [freshMember],
    )).toEqual([freshMember, buildMember("user-2")]);
  });

  it("drops snapshots older than seven days", async () => {
    const identity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-stale",
      conversationId: "conversation-stale",
    };
    cache.writeConversationMemberProfileCache(identity, [buildMember("user-stale")]);

    vi.setSystemTime(new Date("2026-09-08T04:00:01.000Z"));
    vi.resetModules();
    const reloadedCache = await import("@/components/conversation-member-profile-cache");

    expect(reloadedCache.readConversationMemberProfileCache(identity)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("keeps an anonymous snapshot separate from an authenticated account", () => {
    const anonymousIdentity = {
      apiNamespace: "ios/v2.0.0",
      trackingUserId: "tracking-1",
      conversationId: "conversation-1",
    };
    const authenticatedIdentity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-1",
      trackingUserId: "tracking-1",
      conversationId: "conversation-1",
    };

    cache.writeConversationMemberProfileCache(anonymousIdentity, [buildMember("user-1")]);

    expect(cache.readConversationMemberProfileMemoryCache(authenticatedIdentity)).toBeNull();
  });
});
