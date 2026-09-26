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
import { isSearchExcludedHandle } from "@/lib/handles";
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
import { resolveConnectSearchRestore } from "@/components/connect-search-restore";
import UnifiedSearch from "@/components/search/unified-search";
import { postViewerHref, searchPeopleHref } from "@/lib/feed-routes";
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

  const query = rawSnapshot.query.trim();
  return {
    query,
    results: rawSnapshot.results.filter((result) => !isSearchExcludedHandle(result.handle)),
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
  const pendingHistoryRestoreQueryRef = useRef<string | null>(null);
  const skipInitialSearchEffectRef = useRef(false);
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
      pendingHistoryRestoreQueryRef.current = snapshot.query;
      skipInitialSearchEffectRef.current = true;
      setQuery(snapshot.query);
      setResults(snapshot.results);
      setResultsQuery(snapshot.query);
      setNextCursor(snapshot.nextCursor);
    } else {
      pendingHistoryRestoreQueryRef.current = null;
      skipInitialSearchEffectRef.current = false;
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
    const restoreDecision = resolveConnectSearchRestore({
      normalizedQuery,
      pendingQuery: pendingHistoryRestoreQueryRef.current,
      skipInitialEffect: skipInitialSearchEffectRef.current,
    });
    pendingHistoryRestoreQueryRef.current = restoreDecision.nextPendingQuery;
    skipInitialSearchEffectRef.current = restoreDecision.nextSkipInitialEffect;
    if (!restoreDecision.shouldRunSearch) {
      activeSearchQueryRef.current = restoreDecision.activeQuery ?? normalizedQuery;
      return;
    }

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
            ? payload.users.filter((user) => !isSearchExcludedHandle(user.handle))
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
        ? payload.users.filter((user) => !isSearchExcludedHandle(user.handle))
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
        <div className="min-h-0 flex-1">
          <UnifiedSearch
            locale={locale}
            canUseRecentSearches={Boolean(authenticatedUserId)}
            onOpenPerson={(userId) => openConnectProfile(userId)}
            onOpenSearchPost={(searchQuery, postId) =>
              router.push(postViewerHref(locale, { kind: "search", query: searchQuery }, postId))}
            onSeeAllPeople={(searchQuery) => router.push(searchPeopleHref(locale, searchQuery))}
          />
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
