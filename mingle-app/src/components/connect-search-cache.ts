"use client";

const CONNECT_SEARCH_CACHE_KEY_PREFIX = "mingle:connect-search-cache:v1";
const CONNECT_SEARCH_CACHE_MAX_STALE_AGE_MS = 24 * 60 * 60 * 1000;

export type ConnectSearchResult = {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
  imageCropScale?: number | null;
  imageCropX?: number | null;
  imageCropY?: number | null;
  isFollowing: boolean;
};

export type ConnectSearchCacheIdentity = {
  apiNamespace: string;
  authenticatedUserId: string;
};

export type ConnectSearchCacheSnapshot = {
  savedAt: number;
  query: string;
  results: ConnectSearchResult[];
  resultsReady: boolean;
};

const connectSearchMemoryCache = new Map<string, ConnectSearchCacheSnapshot>();

export function isConnectSearchResult(value: unknown): value is ConnectSearchResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Partial<ConnectSearchResult>;
  return typeof candidate.id === "string"
    && (typeof candidate.handle === "string" || candidate.handle === null)
    && (typeof candidate.name === "string" || candidate.name === null)
    && (typeof candidate.image === "string" || candidate.image === null)
    && (typeof candidate.imageCropScale === "undefined"
      || typeof candidate.imageCropScale === "number"
      || candidate.imageCropScale === null)
    && (typeof candidate.imageCropX === "undefined"
      || typeof candidate.imageCropX === "number"
      || candidate.imageCropX === null)
    && (typeof candidate.imageCropY === "undefined"
      || typeof candidate.imageCropY === "number"
      || candidate.imageCropY === null)
    && typeof candidate.isFollowing === "boolean";
}

function buildConnectSearchCacheKey(identity: ConnectSearchCacheIdentity): string | null {
  const apiNamespace = identity.apiNamespace.trim() || "default";
  const authenticatedUserId = identity.authenticatedUserId.trim();
  if (!authenticatedUserId) return null;

  return `${CONNECT_SEARCH_CACHE_KEY_PREFIX}:${encodeURIComponent(apiNamespace)}:${encodeURIComponent(authenticatedUserId)}`;
}

function normalizeCacheSnapshot(
  value: unknown,
  now = Date.now(),
): ConnectSearchCacheSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Partial<ConnectSearchCacheSnapshot>;
  if (
    typeof candidate.savedAt !== "number"
    || !Number.isFinite(candidate.savedAt)
    || candidate.savedAt > now + 60_000
    || now - candidate.savedAt > CONNECT_SEARCH_CACHE_MAX_STALE_AGE_MS
    || typeof candidate.query !== "string"
    || !candidate.query.trim()
    || !Array.isArray(candidate.results)
    || !candidate.results.every(isConnectSearchResult)
    || typeof candidate.resultsReady !== "boolean"
  ) {
    return null;
  }

  return {
    savedAt: candidate.savedAt,
    query: candidate.query.trim(),
    results: candidate.results,
    resultsReady: candidate.resultsReady,
  };
}

export function readConnectSearchMemoryCache(
  identity: ConnectSearchCacheIdentity,
): ConnectSearchCacheSnapshot | null {
  if (typeof window === "undefined") return null;

  const storageKey = buildConnectSearchCacheKey(identity);
  if (!storageKey) return null;

  const cached = normalizeCacheSnapshot(connectSearchMemoryCache.get(storageKey));
  if (cached) return cached;

  connectSearchMemoryCache.delete(storageKey);
  return null;
}

export function readConnectSearchCache(
  identity: ConnectSearchCacheIdentity,
): ConnectSearchCacheSnapshot | null {
  if (typeof window === "undefined") return null;

  const storageKey = buildConnectSearchCacheKey(identity);
  if (!storageKey) return null;

  const memoryCached = readConnectSearchMemoryCache(identity);
  if (memoryCached) return memoryCached;

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) return null;

    const cached = normalizeCacheSnapshot(JSON.parse(rawValue));
    if (!cached) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }

    connectSearchMemoryCache.set(storageKey, cached);
    return cached;
  } catch {
    return null;
  }
}

export function writeConnectSearchCache(
  identity: ConnectSearchCacheIdentity,
  snapshot: Pick<ConnectSearchCacheSnapshot, "query" | "results" | "resultsReady">,
): void {
  if (typeof window === "undefined") return;

  const storageKey = buildConnectSearchCacheKey(identity);
  const query = snapshot.query.trim();
  if (!storageKey || !query) return;

  const cached: ConnectSearchCacheSnapshot = {
    savedAt: Date.now(),
    query,
    results: snapshot.resultsReady ? snapshot.results : [],
    resultsReady: snapshot.resultsReady,
  };
  connectSearchMemoryCache.set(storageKey, cached);

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(cached));
  } catch {
    // The in-memory snapshot still keeps tab re-entry warm when storage is restricted.
  }
}

export function clearConnectSearchCache(identity: ConnectSearchCacheIdentity): void {
  if (typeof window === "undefined") return;

  const storageKey = buildConnectSearchCacheKey(identity);
  if (!storageKey) return;

  connectSearchMemoryCache.delete(storageKey);
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage restrictions; clearing the memory snapshot is sufficient for this tab.
  }
}
