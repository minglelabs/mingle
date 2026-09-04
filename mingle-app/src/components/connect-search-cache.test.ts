import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ConnectSearchCacheModule = typeof import("@/components/connect-search-cache");

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

function buildSearchResult(isFollowing = false) {
  return {
    id: "user-2",
    handle: "mingle-user",
    name: "Mingle User",
    image: "https://example.com/avatar.png",
    isFollowing,
  };
}

describe("connect search cache", () => {
  let cache: ConnectSearchCacheModule;
  let sessionStorage: Storage;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:30:00.000Z"));
    sessionStorage = createStorage();
    vi.stubGlobal("window", { sessionStorage });
    vi.resetModules();
    cache = await import("@/components/connect-search-cache");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the query and resolved result rows for immediate tab re-entry", () => {
    const identity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-1",
    };
    const result = buildSearchResult();

    cache.writeConnectSearchCache(identity, {
      query: "mingle",
      results: [result],
      resultsReady: true,
    });

    expect(cache.readConnectSearchMemoryCache(identity)).toEqual({
      savedAt: Date.now(),
      query: "mingle",
      results: [result],
      resultsReady: true,
    });
  });

  it("stores a pending query without showing results from the previous query", () => {
    const identity = {
      apiNamespace: "android/v2.0.0",
      authenticatedUserId: "user-1",
    };

    cache.writeConnectSearchCache(identity, {
      query: "new query",
      results: [buildSearchResult(true)],
      resultsReady: false,
    });

    expect(cache.readConnectSearchMemoryCache(identity)).toMatchObject({
      query: "new query",
      results: [],
      resultsReady: false,
    });
  });

  it("separates cached searches by authenticated user and API namespace", () => {
    const result = buildSearchResult();
    cache.writeConnectSearchCache({
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-a",
    }, {
      query: "friend",
      results: [result],
      resultsReady: true,
    });

    expect(cache.readConnectSearchMemoryCache({
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-b",
    })).toBeNull();
    expect(cache.readConnectSearchMemoryCache({
      apiNamespace: "android/v2.0.0",
      authenticatedUserId: "user-a",
    })).toBeNull();
  });

  it("restores a session snapshot after the module memory is recreated", async () => {
    const identity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-1",
    };
    const result = buildSearchResult();
    cache.writeConnectSearchCache(identity, {
      query: "friend",
      results: [result],
      resultsReady: true,
    });

    vi.resetModules();
    const reloadedCache = await import("@/components/connect-search-cache");

    expect(reloadedCache.readConnectSearchMemoryCache(identity)).toBeNull();
    expect(reloadedCache.readConnectSearchCache(identity)).toEqual({
      savedAt: Date.now(),
      query: "friend",
      results: [result],
      resultsReady: true,
    });
  });

  it("removes anonymous tracking users from cached search results", () => {
    const identity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-1",
    };
    const storageKey = "mingle:connect-search-cache:v1:ios%2Fv2.0.0:user-1";
    sessionStorage.setItem(storageKey, JSON.stringify({
      savedAt: Date.now(),
      query: "a",
      results: [
        buildSearchResult(),
        { ...buildSearchResult(), id: "anon-user", handle: "anon_mtb662yd_3j2l0q283" },
      ],
      resultsReady: true,
    }));

    const cached = cache.readConnectSearchCache(identity);

    expect(cached?.results.map((result) => result.id)).toEqual(["user-2"]);
  });

  it("clears the cached query when the search field is cleared", () => {
    const identity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-1",
    };
    cache.writeConnectSearchCache(identity, {
      query: "friend",
      results: [buildSearchResult()],
      resultsReady: true,
    });

    cache.clearConnectSearchCache(identity);

    expect(cache.readConnectSearchCache(identity)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("drops snapshots older than one day", async () => {
    const identity = {
      apiNamespace: "ios/v2.0.0",
      authenticatedUserId: "user-stale",
    };
    cache.writeConnectSearchCache(identity, {
      query: "friend",
      results: [buildSearchResult()],
      resultsReady: true,
    });

    vi.setSystemTime(new Date("2026-08-16T12:30:01.000Z"));
    vi.resetModules();
    const reloadedCache = await import("@/components/connect-search-cache");

    expect(reloadedCache.readConnectSearchCache(identity)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
});
