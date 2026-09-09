"use client";

import BottomTabBar, { buildNativeAwareTabPath } from "@/components/bottom-tab-bar";
import { getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";
import PublicUserProfileScreen from "@/components/public-user-profile-screen";
import type { ConversationChannelSummary } from "@/lib/app-conversations";
import {
  clearConnectSearchCache,
  isConnectSearchResult,
  readConnectSearchCache,
  type ConnectSearchCacheIdentity,
  type ConnectSearchResult,
  writeConnectSearchCache,
} from "@/components/connect-search-cache";
import type { AppDictionary, AppLocale } from "@/i18n";
import { buildClientApiPath, clientApiNamespace } from "@/lib/api-contract";
import { observeConnectViewport } from "@/lib/connect-viewport";
import { formatHandle, isAnonymousTrackingHandle } from "@/lib/handles";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import {
  buildSearchAnalyticsProperties,
  digestAnalyticsValue,
  type SearchAnalyticsProperties,
} from "@/lib/search-analytics";
import {
  consumeSlideSurfaceHistoryForScope,
  pushSlideSurfaceHistory,
  readSlideSurfaceHistory,
  readSlideSurfaceHistoryForScope,
  replaceSlideSurfaceHistory,
} from "@/lib/slide-surface-history";
import {
  DIRECT_CONVERSATION_NAVIGATION_GUARD_MS,
  replaceWithConversationListThenPush,
} from "@/lib/direct-conversation-navigation";
import { Loader2, Search, UserRound, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ConnectPageProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
};

type UserSearchResult = ConnectSearchResult;

const CONNECT_SEARCH_HISTORY_STATE_KEY = "__MINGLE_CONNECT_SEARCH_STATE__";
const CONNECT_SURFACE_SCOPE = "connect";
const CONNECT_PROFILE_SURFACE_ID = "profile";

type ConnectSearchHistorySnapshot = {
  query: string;
  results: UserSearchResult[];
  nextCursor: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readConnectSearchHistorySnapshot(): ConnectSearchHistorySnapshot | null {
  if (typeof window === "undefined" || !isRecord(window.history.state)) return null;

  const rawSnapshot = window.history.state[CONNECT_SEARCH_HISTORY_STATE_KEY];
  if (!isRecord(rawSnapshot) || typeof rawSnapshot.query !== "string" || !Array.isArray(rawSnapshot.results)) {
    return null;
  }

  if (
    !rawSnapshot.query.trim()
    || !rawSnapshot.results.every(isConnectSearchResult)
    || (typeof rawSnapshot.nextCursor !== "undefined"
      && rawSnapshot.nextCursor !== null
      && typeof rawSnapshot.nextCursor !== "string")
  ) return null;

  return {
    query: rawSnapshot.query,
    results: rawSnapshot.results.filter((result) => !isAnonymousTrackingHandle(result.handle)),
    nextCursor: typeof rawSnapshot.nextCursor === "string" ? rawSnapshot.nextCursor : null,
  };
}

function replaceConnectSearchHistorySnapshot(snapshot: ConnectSearchHistorySnapshot | null): void {
  if (typeof window === "undefined") return;

  const currentState = isRecord(window.history.state) ? window.history.state : {};
  const nextState = { ...currentState };

  if (snapshot?.query.trim()) {
    nextState[CONNECT_SEARCH_HISTORY_STATE_KEY] = snapshot;
  } else {
    delete nextState[CONNECT_SEARCH_HISTORY_STATE_KEY];
  }

  try {
    window.history.replaceState(nextState, "");
  } catch {
    // History state is an optional enhancement; the search itself remains available.
  }
}

function resolveSearchCopy(dictionary: AppDictionary) {
  const isKorean = dictionary.titles.connect === "탐색" || dictionary.titles.connect === "친구 찾기";
  return {
    placeholder: dictionary.connect.searchPlaceholder
      ?? (isKorean ? "아이디 또는 이름 검색" : "Search by handle or name"),
    searching: dictionary.connect.searchingLabel
      ?? (isKorean ? "검색 중..." : "Searching..."),
    noResults: dictionary.connect.searchNoResults
      ?? (isKorean ? "검색 결과가 없습니다." : "No results found."),
    error: dictionary.connect.searchError
      ?? (isKorean ? "검색하지 못했습니다. 다시 시도해 주세요." : "Could not search. Please try again."),
    userFallback: dictionary.connect.userFallbackLabel
      ?? (isKorean ? "Mingle 사용자" : "Mingle user"),
    follow: dictionary.connect.followAction
      ?? (isKorean ? "팔로우" : "Follow"),
    following: dictionary.connect.followingAction
      ?? (isKorean ? "팔로잉" : "Following"),
    followError: dictionary.connect.followError
      ?? (isKorean ? "팔로우 상태를 변경하지 못했습니다." : "Could not update follow status."),
    clearSearch: dictionary.connect.clearSearchLabel
      ?? (isKorean ? "검색어 지우기" : "Clear search"),
    loadMore: dictionary.connect.loadMoreLabel
      ?? (isKorean ? "더 보기" : "Load more"),
    loadingMore: dictionary.connect.loadingMoreLabel
      ?? (isKorean ? "불러오는 중..." : "Loading more..."),
    loadMoreError: dictionary.connect.loadMoreError
      ?? (isKorean ? "추가 결과를 불러오지 못했습니다. 다시 시도해 주세요." : "Could not load more results. Please try again."),
  };
}

function normalizeSearchCursor(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function appendUniqueSearchResults(
  currentResults: UserSearchResult[],
  nextResults: UserSearchResult[],
): UserSearchResult[] {
  const existingIds = new Set(currentResults.map((result) => result.id));
  return [
    ...currentResults,
    ...nextResults.filter((result) => !existingIds.has(result.id)),
  ];
}

function buildConnectTrackingHeaders(): Record<string, string> {
  const clientPlatform = clientApiNamespace.startsWith("android/")
    ? "android"
    : clientApiNamespace.startsWith("ios/")
      ? "ios"
      : "web";

  return {
    "x-mingle-user-id": getOrCreateTrackingUserId(),
    "x-mingle-api-namespace": clientApiNamespace,
    "x-mingle-client-platform": clientPlatform,
  };
}

export default function ConnectPage({ dictionary, locale }: ConnectPageProps) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const requestSequenceRef = useRef(0);
  const searchRequestSequenceRef = useRef(0);
  const activeSearchQueryRef = useRef("");
  const loadingMoreRef = useRef(false);
  const lastSearchContextRef = useRef<{
    query: string;
    sequence: number;
    properties: SearchAnalyticsProperties;
  } | null>(null);
  const isMountedRef = useRef(false);
  const initialHistorySnapshotRef = useRef<ConnectSearchHistorySnapshot | null>(null);
  const hydratedCacheIdentityRef = useRef("");
  const pendingDirectConversationNavigationRef = useRef(false);
  const directConversationNavigationReleaseTimerRef = useRef<number | null>(null);
  const authenticatedUserId = typeof session?.user?.id === "string"
    ? session.user.id.trim()
    : "";
  const searchCacheIdentity = useMemo<ConnectSearchCacheIdentity>(() => ({
    apiNamespace: clientApiNamespace,
    authenticatedUserId,
  }), [authenticatedUserId]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searchingQuery, setSearchingQuery] = useState("");
  const [resultsQuery, setResultsQuery] = useState("");
  const [searchError, setSearchError] = useState(false);
  const [searchErrorQuery, setSearchErrorQuery] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [followInFlightIds, setFollowInFlightIds] = useState<Set<string>>(new Set());
  const [followError, setFollowError] = useState(false);
  const [connectSurfaceHistory, setConnectSurfaceHistory] = useState(() => (
    typeof window === "undefined" ? [] : readSlideSurfaceHistoryForScope(CONNECT_SURFACE_SCOPE)
  ));
  const copy = resolveSearchCopy(dictionary);
  const normalizedQuery = query.trim();
  const visibleResults = resultsQuery === normalizedQuery ? results : [];
  const hasMoreResults = resultsQuery === normalizedQuery && Boolean(nextCursor);
  const isSearching = Boolean(normalizedQuery)
    && searchingQuery === normalizedQuery
    && visibleResults.length === 0;
  const isSearchErrorVisible = searchError && searchErrorQuery === normalizedQuery;
  const connectProfileSurface = [...connectSurfaceHistory]
    .reverse()
    .find((entry) => entry.id === CONNECT_PROFILE_SURFACE_ID);

  const focusSearchInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const dismissSearchKeyboard = useCallback(() => {
    inputRef.current?.blur();
  }, []);

  useEffect(() => {
    if (!pageRef.current) return;
    return observeConnectViewport(pageRef.current);
  }, []);

  const handleSearchQueryChange = useCallback((nextQuery: string) => {
    if (resultsRef.current) resultsRef.current.scrollTop = 0;
    setQuery(nextQuery);
    const normalizedNextQuery = nextQuery.trim();
    activeSearchQueryRef.current = normalizedNextQuery;
    loadingMoreRef.current = false;
    setIsLoadingMore(false);
    setLoadMoreError(false);
    setNextCursor(null);
    if (normalizedNextQuery) {
      writeConnectSearchCache(searchCacheIdentity, {
        query: normalizedNextQuery,
        results: [],
        resultsReady: false,
        nextCursor: null,
      });
    } else {
      clearConnectSearchCache(searchCacheIdentity);
    }
    replaceConnectSearchHistorySnapshot(normalizedNextQuery
      ? { query: normalizedNextQuery, results: [], nextCursor: null }
      : null);
  }, [searchCacheIdentity]);

  const handleToggleFollow = useCallback(async (user: UserSearchResult) => {
    if (followInFlightIds.has(user.id)) return;

    const nextIsFollowing = !user.isFollowing;
    const normalizedSearchQuery = normalizedQuery;
    const resultIndex = results.findIndex((candidate) => candidate.id === user.id);
    const searchContext = lastSearchContextRef.current?.query === normalizedSearchQuery
      ? lastSearchContextRef.current
      : null;
    const followStartedAt = performance.now();
    setFollowError(false);
    setFollowInFlightIds((current) => new Set(current).add(user.id));
    setResults((current) => current.map((candidate) => (
      candidate.id === user.id
        ? { ...candidate, isFollowing: nextIsFollowing }
        : candidate
    )));

    try {
      const [targetUserDigest, searchProperties] = await Promise.all([
        digestAnalyticsValue(user.id),
        searchContext?.properties
          ? Promise.resolve(searchContext.properties)
          : buildSearchAnalyticsProperties(normalizedSearchQuery),
      ]);
      captureMingleClientEvent("mingle_connect_follow_clicked", {
        action: nextIsFollowing ? "follow" : "unfollow",
        target_user_digest: targetUserDigest,
        result_index: resultIndex >= 0 ? resultIndex : null,
        result_count: results.length,
        search_sequence: searchContext?.sequence ?? 0,
        has_search_context: Boolean(searchContext),
        ...searchProperties,
      });

      const response = await fetch(
        buildClientApiPath(`/users/${encodeURIComponent(user.id)}/follow`),
        {
          method: nextIsFollowing ? "POST" : "DELETE",
          headers: buildConnectTrackingHeaders(),
        },
      );
      if (!response.ok) throw new Error("follow_update_failed");
      captureMingleClientEvent("mingle_connect_follow_completed", {
        action: nextIsFollowing ? "follow" : "unfollow",
        target_user_digest: targetUserDigest,
        success: true,
        http_status: response.status,
        duration_ms: Math.max(0, Math.round(performance.now() - followStartedAt)),
      });
    } catch {
      captureMingleClientEvent("mingle_connect_follow_completed", {
        action: nextIsFollowing ? "follow" : "unfollow",
        success: false,
        duration_ms: Math.max(0, Math.round(performance.now() - followStartedAt)),
      });
      setFollowError(true);
      setResults((current) => current.map((candidate) => (
        candidate.id === user.id
          ? { ...candidate, isFollowing: user.isFollowing }
          : candidate
      )));
    } finally {
      setFollowInFlightIds((current) => {
        const next = new Set(current);
        next.delete(user.id);
        return next;
      });
    }
  }, [followInFlightIds, normalizedQuery, results]);

  useEffect(() => {
    const syncConnectSurfaceHistory = () => {
      const nextHistory = readSlideSurfaceHistoryForScope(CONNECT_SURFACE_SCOPE);
      if (pendingDirectConversationNavigationRef.current) {
        const filteredHistory = nextHistory.filter((entry) => entry.id !== CONNECT_PROFILE_SURFACE_ID);
        if (filteredHistory.length !== nextHistory.length) {
          setConnectSurfaceHistory(filteredHistory);
          return;
        }
      }
      setConnectSurfaceHistory(nextHistory);
    };

    window.addEventListener("popstate", syncConnectSurfaceHistory);
    return () => window.removeEventListener("popstate", syncConnectSurfaceHistory);
  }, []);

  const openConnectProfile = useCallback((userId: string) => {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return;

    pushSlideSurfaceHistory({
      scope: CONNECT_SURFACE_SCOPE,
      id: CONNECT_PROFILE_SURFACE_ID,
      value: normalizedUserId,
    });
    setConnectSurfaceHistory(readSlideSurfaceHistoryForScope(CONNECT_SURFACE_SCOPE));
  }, []);

  const closeConnectProfile = useCallback((userId: string) => {
    const currentEntries = readSlideSurfaceHistoryForScope(CONNECT_SURFACE_SCOPE);
    const currentEntry = currentEntries[currentEntries.length - 1];
    if (
      currentEntry?.id === CONNECT_PROFILE_SURFACE_ID
      && currentEntry.value === userId
    ) {
      window.history.back();
      return;
    }

    setConnectSurfaceHistory((current) => {
      const entryIndex = [...current].reverse().findIndex((entry) => (
        entry.id === CONNECT_PROFILE_SURFACE_ID && entry.value === userId
      ));
      if (entryIndex < 0) return current;
      const actualIndex = current.length - 1 - entryIndex;
      return current.filter((_entry, index) => index !== actualIndex);
    });
  }, []);

  const startDirectConversationFromConnectProfile = useCallback(async (
    conversation: ConversationChannelSummary,
  ) => {
    if (!conversation.id || pendingDirectConversationNavigationRef.current) return;

    pendingDirectConversationNavigationRef.current = true;
    if (directConversationNavigationReleaseTimerRef.current !== null) {
      window.clearTimeout(directConversationNavigationReleaseTimerRef.current);
      directConversationNavigationReleaseTimerRef.current = null;
    }

    try {
      await consumeSlideSurfaceHistoryForScope(CONNECT_SURFACE_SCOPE);
      if (typeof window !== "undefined") {
        replaceSlideSurfaceHistory(readSlideSurfaceHistory(window.history.state).filter((entry) => (
          entry.scope !== CONNECT_SURFACE_SCOPE
        )));
      }
      setConnectSurfaceHistory([]);

      const conversationListHref = buildNativeAwareTabPath(
        `/${locale}/conversations`,
        searchParams,
        { skipConversationRestore: true, tabRoot: true },
      );
      await replaceWithConversationListThenPush(router, conversationListHref, conversation.id);
    } finally {
      directConversationNavigationReleaseTimerRef.current = window.setTimeout(() => {
        pendingDirectConversationNavigationRef.current = false;
        directConversationNavigationReleaseTimerRef.current = null;
      }, DIRECT_CONVERSATION_NAVIGATION_GUARD_MS);
    }
  }, [locale, router, searchParams]);

  useEffect(() => {
    isMountedRef.current = true;
    const snapshot = readConnectSearchHistorySnapshot();
    initialHistorySnapshotRef.current = snapshot;
    if (snapshot) {
      setQuery(snapshot.query);
      setResults(snapshot.results);
      setResultsQuery(snapshot.query);
      setNextCursor(snapshot.nextCursor);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      !isMountedRef.current
      || sessionStatus !== "authenticated"
      || !authenticatedUserId
    ) {
      return;
    }

    const cacheIdentityKey = `${clientApiNamespace}:${authenticatedUserId}`;
    if (hydratedCacheIdentityRef.current === cacheIdentityKey) return;

    const isFirstAuthenticatedIdentity = !hydratedCacheIdentityRef.current;
    hydratedCacheIdentityRef.current = cacheIdentityKey;
    activeSearchQueryRef.current = initialHistorySnapshotRef.current?.query ?? "";

    // The history snapshot is the freshest source when returning from a profile.
    if (isFirstAuthenticatedIdentity && initialHistorySnapshotRef.current) return;

    const snapshot = readConnectSearchCache(searchCacheIdentity);
    if (!snapshot) {
      if (isFirstAuthenticatedIdentity && !initialHistorySnapshotRef.current) return;
      setQuery("");
      setResults([]);
      setResultsQuery("");
      setNextCursor(null);
      return;
    }

    setQuery(snapshot.query);
    setResults(snapshot.resultsReady ? snapshot.results : []);
    setResultsQuery(snapshot.resultsReady ? snapshot.query : "");
    setNextCursor(snapshot.resultsReady ? snapshot.nextCursor : null);
    setSearchError(false);
    setSearchErrorQuery("");
  }, [authenticatedUserId, searchCacheIdentity, sessionStatus]);

  useEffect(() => {
    if (!isMountedRef.current || !resultsQuery) return;
    replaceConnectSearchHistorySnapshot({ query: resultsQuery, results, nextCursor });
  }, [nextCursor, results, resultsQuery]);

  useEffect(() => {
    if (
      !isMountedRef.current
      || sessionStatus !== "authenticated"
      || !authenticatedUserId
      || !normalizedQuery
      || resultsQuery !== normalizedQuery
    ) {
      return;
    }

    writeConnectSearchCache(searchCacheIdentity, {
      query: normalizedQuery,
      results,
      resultsReady: true,
      nextCursor,
    });
  }, [
    authenticatedUserId,
    normalizedQuery,
    results,
    resultsQuery,
    nextCursor,
    searchCacheIdentity,
    sessionStatus,
  ]);

  useEffect(() => {
    const requestSequence = ++requestSequenceRef.current;
    activeSearchQueryRef.current = normalizedQuery;
    loadingMoreRef.current = false;
    setIsLoadingMore(false);
    setLoadMoreError(false);
    setNextCursor(null);

    if (!normalizedQuery) {
      setSearchingQuery("");
      setResults([]);
      setResultsQuery("");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const searchSequence = ++searchRequestSequenceRef.current;
      const searchStartedAt = performance.now();
      setSearchingQuery(normalizedQuery);
      setSearchError(false);
      setSearchErrorQuery("");

      void (async () => {
        const searchProperties = await buildSearchAnalyticsProperties(normalizedQuery);
        captureMingleClientEvent("mingle_connect_search_requested", {
          search_sequence: searchSequence,
          ...searchProperties,
        });

        let httpStatus: number | null = null;
        try {
          const requestParams = new URLSearchParams({ q: normalizedQuery });
          const response = await fetch(
            buildClientApiPath(`/users/search?${requestParams.toString()}`),
            {
              cache: "no-store",
              headers: buildConnectTrackingHeaders(),
            },
          );
          httpStatus = response.status;
          if (!response.ok) throw new Error("user_search_failed");
          const payload = await response.json() as {
            users?: UserSearchResult[];
            nextCursor?: unknown;
          };
          const users = Array.isArray(payload.users)
            ? payload.users.filter((user) => !isAnonymousTrackingHandle(user.handle))
            : [];
          const responseNextCursor = normalizeSearchCursor(payload.nextCursor);
          captureMingleClientEvent("mingle_connect_search_completed", {
            search_sequence: searchSequence,
            success: true,
            http_status: httpStatus,
            result_count: users.length,
            has_more: Boolean(responseNextCursor),
            load_more: false,
            duration_ms: Math.max(0, Math.round(performance.now() - searchStartedAt)),
            ...searchProperties,
          });

          if (
            requestSequenceRef.current !== requestSequence
            || activeSearchQueryRef.current !== normalizedQuery
            || !isMountedRef.current
          ) return;
          setResults(users);
          setResultsQuery(normalizedQuery);
          setNextCursor(responseNextCursor);
          lastSearchContextRef.current = {
            query: normalizedQuery,
            sequence: searchSequence,
            properties: searchProperties,
          };
        } catch {
          captureMingleClientEvent("mingle_connect_search_completed", {
            search_sequence: searchSequence,
            success: false,
            http_status: httpStatus,
            result_count: 0,
            has_more: false,
            load_more: false,
            duration_ms: Math.max(0, Math.round(performance.now() - searchStartedAt)),
            ...searchProperties,
          });
          if (
            requestSequenceRef.current !== requestSequence
            || activeSearchQueryRef.current !== normalizedQuery
            || !isMountedRef.current
          ) return;
          setResults([]);
          setResultsQuery("");
          setNextCursor(null);
          setSearchError(true);
          setSearchErrorQuery(normalizedQuery);
        } finally {
          if (requestSequenceRef.current === requestSequence && isMountedRef.current) {
            setSearchingQuery("");
          }
        }
      })();
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [normalizedQuery]);

  const loadMoreSearchResults = useCallback(async () => {
    const pageQuery = normalizedQuery;
    const cursor = nextCursor;
    if (
      !pageQuery
      || resultsQuery !== pageQuery
      || !cursor
      || loadingMoreRef.current
    ) return;

    const requestSequence = requestSequenceRef.current;
    const searchContext = lastSearchContextRef.current?.query === pageQuery
      ? lastSearchContextRef.current
      : null;
    const searchStartedAt = performance.now();
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(false);

    const searchProperties = searchContext?.properties
      ?? await buildSearchAnalyticsProperties(pageQuery);
    captureMingleClientEvent("mingle_connect_search_requested", {
      search_sequence: searchContext?.sequence ?? 0,
      load_more: true,
      ...searchProperties,
    });

    let httpStatus: number | null = null;
    try {
      const requestParams = new URLSearchParams({ q: pageQuery, cursor });
      const response = await fetch(
        buildClientApiPath(`/users/search?${requestParams.toString()}`),
        {
          cache: "no-store",
          headers: buildConnectTrackingHeaders(),
        },
      );
      httpStatus = response.status;
      if (!response.ok) throw new Error("user_search_failed");
      const payload = await response.json() as {
        users?: UserSearchResult[];
        nextCursor?: unknown;
      };
      const users = Array.isArray(payload.users)
        ? payload.users.filter((user) => !isAnonymousTrackingHandle(user.handle))
        : [];
      const responseNextCursor = normalizeSearchCursor(payload.nextCursor);
      captureMingleClientEvent("mingle_connect_search_completed", {
        search_sequence: searchContext?.sequence ?? 0,
        success: true,
        http_status: httpStatus,
        result_count: users.length,
        has_more: Boolean(responseNextCursor),
        load_more: true,
        duration_ms: Math.max(0, Math.round(performance.now() - searchStartedAt)),
        ...searchProperties,
      });

      if (
        requestSequenceRef.current !== requestSequence
        || activeSearchQueryRef.current !== pageQuery
        || !isMountedRef.current
      ) return;
      setResults((currentResults) => appendUniqueSearchResults(currentResults, users));
      setNextCursor(responseNextCursor);
    } catch {
      captureMingleClientEvent("mingle_connect_search_completed", {
        search_sequence: searchContext?.sequence ?? 0,
        success: false,
        http_status: httpStatus,
        result_count: 0,
        has_more: Boolean(cursor),
        load_more: true,
        duration_ms: Math.max(0, Math.round(performance.now() - searchStartedAt)),
        ...searchProperties,
      });
      if (
        requestSequenceRef.current === requestSequence
        && activeSearchQueryRef.current === pageQuery
        && isMountedRef.current
      ) {
        setLoadMoreError(true);
      }
    } finally {
      loadingMoreRef.current = false;
      if (
        requestSequenceRef.current === requestSequence
        && activeSearchQueryRef.current === pageQuery
        && isMountedRef.current
      ) {
        setIsLoadingMore(false);
      }
    }
  }, [nextCursor, normalizedQuery, resultsQuery]);

  useEffect(() => {
    const scrollContainer = resultsRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (
      !scrollContainer
      || !sentinel
      || !hasMoreResults
      || typeof IntersectionObserver === "undefined"
    ) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMoreSearchResults();
      }
    }, {
      root: scrollContainer,
      rootMargin: "240px 0px",
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreResults, loadMoreSearchResults]);

  return (
    <>
      <main ref={pageRef} className="connect-page relative flex h-full min-h-0 w-full flex-col overflow-clip bg-white text-slate-900">
      <header
        className="shrink-0 px-4 pb-3"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 44px) + 12px)",
        }}
      >
        <form
          role="search"
          className="relative block"
          onSubmit={(event) => {
            event.preventDefault();
            dismissSearchKeyboard();
          }}
        >
          <Search
            size={19}
            strokeWidth={2.1}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => handleSearchQueryChange(event.target.value)}
            placeholder={copy.placeholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label={copy.placeholder}
            className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-10 text-[15px] text-slate-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-amber-100"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                handleSearchQueryChange("");
                focusSearchInput();
              }}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition active:bg-gray-200"
              aria-label={copy.clearSearch}
            >
              <X size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : null}
        </form>
      </header>

      <div
        ref={resultsRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
        onTouchMove={dismissSearchKeyboard}
        onClickCapture={dismissSearchKeyboard}
      >
        {followError ? (
          <p className="px-6 pt-4 text-center text-[13px] text-red-500" role="alert">
            {copy.followError}
          </p>
        ) : null}
        {isSearching ? (
          <div className="flex justify-center pt-6 text-gray-400" aria-live="polite">
            <Loader2 size={22} className="animate-spin" aria-label={copy.searching} />
          </div>
        ) : isSearchErrorVisible ? (
          <p className="px-6 pt-6 text-center text-[14px] text-gray-500" role="alert">
            {copy.error}
          </p>
        ) : normalizedQuery && visibleResults.length === 0 ? (
          <p className="px-6 pt-6 text-center text-[14px] text-gray-500" aria-live="polite">
            {copy.noResults}
          </p>
        ) : visibleResults.length > 0 ? (
          <>
            <ul className="border-t border-gray-100">
              {visibleResults.map((user) => {
                const name = user.name?.trim() || copy.userFallback;
                const isFollowPending = followInFlightIds.has(user.id);
                return (
                  <li key={user.id} className="border-b border-gray-100 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openConnectProfile(user.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                        aria-label={user.handle ? `${name}, ${formatHandle(user.handle)}` : name}
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
                          {user.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={user.image}
                              alt=""
                              className="h-full w-full object-cover"
                              style={{
                                transform: buildProfileImageTransform(44, {
                                  scale: user.imageCropScale,
                                  x: user.imageCropX,
                                  y: user.imageCropY,
                                }),
                              }}
                            />
                          ) : (
                            <UserRound size={24} className="text-gray-400" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-slate-900">{name}</p>
                          {user.handle ? <p className="truncate text-[13px] text-gray-500">{formatHandle(user.handle)}</p> : null}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleFollow(user)}
                        disabled={isFollowPending}
                        aria-busy={isFollowPending}
                        className={`ml-auto flex h-10 min-w-[4.5rem] shrink-0 items-center justify-center rounded-lg border px-3 text-center text-[13px] font-semibold transition-colors active:opacity-70 disabled:cursor-wait disabled:opacity-50 ${
                          user.isFollowing
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-gray-200 bg-white text-slate-800"
                        }`}
                        aria-pressed={user.isFollowing}
                      >
                        {isFollowPending ? "…" : user.isFollowing ? copy.following : copy.follow}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {hasMoreResults ? (
              <div className="flex flex-col items-center gap-2 px-4 py-4">
                <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden="true" />
                {loadMoreError ? (
                  <p className="text-center text-[13px] text-red-500" role="alert">
                    {copy.loadMoreError}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void loadMoreSearchResults()}
                  disabled={isLoadingMore}
                  aria-busy={isLoadingMore}
                  className="inline-flex min-h-9 min-w-[10rem] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-4 py-2 text-center text-[13px] font-semibold text-slate-800 transition-colors active:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {isLoadingMore ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                  <span>{isLoadingMore ? copy.loadingMore : copy.loadMore}</span>
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

        <div className="connect-bottom-tabs shrink-0" onClickCapture={dismissSearchKeyboard}>
          <BottomTabBar activeRoute="connect" dictionary={dictionary} locale={locale} />
        </div>
      </main>
      <PublicUserProfileScreen
        dictionary={dictionary}
        locale={locale}
        userId={connectProfileSurface?.value ?? ""}
        open={Boolean(connectProfileSurface?.value)}
        onStartDirectConversation={startDirectConversationFromConnectProfile}
        onClose={() => {
          if (!connectProfileSurface?.value) return;
          closeConnectProfile(connectProfileSurface.value);
        }}
      />
    </>
  );
}
