"use client";

import BottomTabBar from "@/components/bottom-tab-bar";
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
import { formatHandle } from "@/lib/handles";
import { Loader2, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ConnectPageProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
};

type UserSearchResult = ConnectSearchResult;

const CONNECT_SEARCH_HISTORY_STATE_KEY = "__MINGLE_CONNECT_SEARCH_STATE__";

type ConnectSearchHistorySnapshot = {
  query: string;
  results: UserSearchResult[];
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

  if (!rawSnapshot.query.trim() || !rawSnapshot.results.every(isConnectSearchResult)) return null;

  return {
    query: rawSnapshot.query,
    results: rawSnapshot.results,
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
  };
}

export default function ConnectPage({ dictionary, locale }: ConnectPageProps) {
  const { data: session, status: sessionStatus } = useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestSequenceRef = useRef(0);
  const isMountedRef = useRef(false);
  const initialHistorySnapshotRef = useRef<ConnectSearchHistorySnapshot | null>(null);
  const hydratedCacheIdentityRef = useRef("");
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
  const [followInFlightIds, setFollowInFlightIds] = useState<Set<string>>(new Set());
  const [followError, setFollowError] = useState(false);
  const copy = resolveSearchCopy(dictionary);
  const normalizedQuery = query.trim();
  const visibleResults = resultsQuery === normalizedQuery ? results : [];
  const isSearching = Boolean(normalizedQuery)
    && searchingQuery === normalizedQuery
    && visibleResults.length === 0;
  const isSearchErrorVisible = searchError && searchErrorQuery === normalizedQuery;

  const focusSearchInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const handleSearchQueryChange = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
    const normalizedNextQuery = nextQuery.trim();
    if (normalizedNextQuery) {
      writeConnectSearchCache(searchCacheIdentity, {
        query: normalizedNextQuery,
        results: [],
        resultsReady: false,
      });
    } else {
      clearConnectSearchCache(searchCacheIdentity);
    }
    replaceConnectSearchHistorySnapshot(normalizedNextQuery
      ? { query: normalizedNextQuery, results: [] }
      : null);
  }, [searchCacheIdentity]);

  const handleToggleFollow = useCallback(async (user: UserSearchResult) => {
    if (followInFlightIds.has(user.id)) return;

    const nextIsFollowing = !user.isFollowing;
    setFollowError(false);
    setFollowInFlightIds((current) => new Set(current).add(user.id));
    setResults((current) => current.map((candidate) => (
      candidate.id === user.id
        ? { ...candidate, isFollowing: nextIsFollowing }
        : candidate
    )));

    try {
      const response = await fetch(
        buildClientApiPath(`/users/${encodeURIComponent(user.id)}/follow`),
        { method: nextIsFollowing ? "POST" : "DELETE" },
      );
      if (!response.ok) throw new Error("follow_update_failed");
    } catch {
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
  }, [followInFlightIds]);

  useEffect(() => {
    isMountedRef.current = true;
    const snapshot = readConnectSearchHistorySnapshot();
    initialHistorySnapshotRef.current = snapshot;
    if (snapshot) {
      setQuery(snapshot.query);
      setResults(snapshot.results);
      setResultsQuery(snapshot.query);
    }
    focusSearchInput();
    const focusAnimationFrameId = window.requestAnimationFrame(() => {
      focusSearchInput();
    });
    const focusTimeoutIds = [
      window.setTimeout(focusSearchInput, 120),
      window.setTimeout(focusSearchInput, 300),
    ];

    return () => {
      isMountedRef.current = false;
      window.cancelAnimationFrame(focusAnimationFrameId);
      focusTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [focusSearchInput]);

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

    // The history snapshot is the freshest source when returning from a profile.
    if (isFirstAuthenticatedIdentity && initialHistorySnapshotRef.current) return;

    const snapshot = readConnectSearchCache(searchCacheIdentity);
    if (!snapshot) {
      if (isFirstAuthenticatedIdentity && !initialHistorySnapshotRef.current) return;
      setQuery("");
      setResults([]);
      setResultsQuery("");
      return;
    }

    setQuery(snapshot.query);
    setResults(snapshot.resultsReady ? snapshot.results : []);
    setResultsQuery(snapshot.resultsReady ? snapshot.query : "");
    setSearchError(false);
    setSearchErrorQuery("");
  }, [authenticatedUserId, searchCacheIdentity, sessionStatus]);

  useEffect(() => {
    if (!isMountedRef.current || !resultsQuery) return;
    replaceConnectSearchHistorySnapshot({ query: resultsQuery, results });
  }, [results, resultsQuery]);

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
    });
  }, [
    authenticatedUserId,
    normalizedQuery,
    results,
    resultsQuery,
    searchCacheIdentity,
    sessionStatus,
  ]);

  useEffect(() => {
    const requestSequence = ++requestSequenceRef.current;

    if (!normalizedQuery) return;

    const timeoutId = window.setTimeout(() => {
      setSearchingQuery(normalizedQuery);
      setSearchError(false);
      setSearchErrorQuery("");

      void fetch(buildClientApiPath(`/users/search?q=${encodeURIComponent(normalizedQuery)}`), {
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("user_search_failed");
          return response.json() as Promise<{ users?: UserSearchResult[] }>;
        })
        .then((payload) => {
          if (requestSequenceRef.current !== requestSequence || !isMountedRef.current) return;
          setResults(Array.isArray(payload.users) ? payload.users : []);
          setResultsQuery(normalizedQuery);
        })
        .catch(() => {
          if (requestSequenceRef.current !== requestSequence || !isMountedRef.current) return;
          setResults([]);
          setResultsQuery("");
          setSearchError(true);
          setSearchErrorQuery(normalizedQuery);
        })
        .finally(() => {
          if (requestSequenceRef.current === requestSequence && isMountedRef.current) {
            setSearchingQuery("");
          }
        });
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [normalizedQuery]);

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900">
      <header
        className="shrink-0 px-4 pb-3"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 44px) + 12px)",
        }}
      >
        <label className="relative block">
          <Search
            size={19}
            strokeWidth={2.1}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => handleSearchQueryChange(event.target.value)}
            placeholder={copy.placeholder}
            autoComplete="off"
            autoCorrect="off"
            autoFocus
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
        </label>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
          <ul className="border-t border-gray-100">
            {visibleResults.map((user) => {
              const name = user.name?.trim() || copy.userFallback;
              const profileHref = `/${locale}/users/${encodeURIComponent(user.handle || user.id)}`;
              return (
                <li key={user.id} className="border-b border-gray-100 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Link
                      href={profileHref}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                      aria-label={user.handle ? `${name}, ${formatHandle(user.handle)}` : name}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
                        {user.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <UserRound size={24} className="text-gray-400" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-slate-900">{name}</p>
                        {user.handle ? <p className="truncate text-[13px] text-gray-500">{formatHandle(user.handle)}</p> : null}
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleToggleFollow(user)}
                      disabled={followInFlightIds.has(user.id)}
                      className={`ml-auto shrink-0 rounded-lg border px-3 py-2 text-[13px] font-semibold transition active:opacity-70 disabled:opacity-50 ${
                        user.isFollowing
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-gray-200 bg-white text-slate-800"
                      }`}
                      aria-pressed={user.isFollowing}
                    >
                      {followInFlightIds.has(user.id) ? "…" : user.isFollowing ? copy.following : copy.follow}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <BottomTabBar activeRoute="connect" dictionary={dictionary} locale={locale} />
    </main>
  );
}
