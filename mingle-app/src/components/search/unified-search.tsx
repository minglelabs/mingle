"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { AppLocale } from "@/i18n";
import { buildClientApiPath, clientSupportsPostingFeed } from "@/lib/api-contract";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { buildSearchAnalyticsProperties } from "@/lib/search-analytics";
import { searchCopy } from "@/i18n/search-copy";
import { feedSourceEndpoint } from "@/lib/feed-routes";
import { isSearchExcludedHandle } from "@/lib/handles";
import type { ConnectSearchResult } from "@/components/connect-search-cache";
import PostGrid from "./post-grid";
import { buildConnectTrackingHeaders, PersonRow, usePeopleFollow, type PeopleSearchContext } from "./people-follow";
import {
  createRecentSearchRecorder,
  createSearchInputController,
  shouldApplyResponse,
  shouldShowNoResults,
  type SearchInputController,
} from "./unified-search-logic";
import { readPeopleSnapshot, rememberPeopleSnapshot } from "./search-session-cache";
import {
  clearAllRecentSearches,
  deleteRecentSearch,
  fetchRecentSearches,
  recordRecentSearch,
  type RecentSearch,
} from "./recent-searches-client";

const PEOPLE_PREVIEW_LIMIT = 3;

export type UnifiedSearchProps = {
  locale: AppLocale;
  displayLanguage?: string | null;
  /** Whether recent searches may be shown (signed-out hides them). */
  canUseRecentSearches: boolean;
  /** The signed-in user's id, so their own row never shows a follow button. Empty when signed out. */
  currentUserId?: string;
  /** Open a person's profile (people result / see-all). */
  onOpenPerson: (userId: string) => void;
  /** Open a post in the search viewer, scoped to this query's results. */
  onOpenSearchPost: (query: string, postId: string) => void;
  /** Open the full sliding people-list screen ("see all"). */
  onSeeAllPeople: (query: string) => void;
  /**
   * Controlled query so the parent can restore it on back-navigation (e.g.
   * from `?q=`). The value present at mount is treated as an already-run
   * search: its session snapshot (people + post tiles + scroll) is restored.
   */
  query?: string;
  onQueryChange?: (query: string) => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
};

export default function UnifiedSearch({
  locale,
  displayLanguage,
  canUseRecentSearches,
  currentUserId,
  onOpenPerson,
  onOpenSearchPost,
  onSeeAllPeople,
  query: controlledQuery,
  onQueryChange: controlledOnQueryChange,
  scrollContainerRef,
}: UnifiedSearchProps) {
  const copy = searchCopy(locale);
  const postingFeedEnabled = clientSupportsPostingFeed;
  const [internalQuery, setInternalQuery] = useState("");
  const query = controlledQuery ?? internalQuery;
  const onQueryChange = controlledOnQueryChange ?? setInternalQuery;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const internalScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = (scrollContainerRef ?? internalScrollRef) as React.RefObject<HTMLDivElement | null>;
  const searchSeqRef = useRef(0);
  const analyticsSeqRef = useRef(0);
  const normalizedQuery = query.trim();

  // The query present at mount is a return to an earlier search.
  const [initialQuery] = useState(normalizedQuery);
  const [initialPeople] = useState(() => (initialQuery ? readPeopleSnapshot(initialQuery) : null));
  const activeQueryRef = useRef(initialQuery);

  const [people, setPeople] = useState<ConnectSearchResult[]>(initialPeople?.people ?? []);
  const [peopleQuery, setPeopleQuery] = useState(initialPeople ? initialQuery : "");
  const [hasMorePeople, setHasMorePeople] = useState(initialPeople?.hasMore ?? false);
  /** The debounced, composition-safe query that BOTH people and posts use. */
  const [dispatchedQuery, setDispatchedQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [postsEmpty, setPostsEmpty] = useState(false);
  const lastSearchContextRef = useRef<PeopleSearchContext>(null);
  const { followInFlightIds, followError, toggleFollow } = usePeopleFollow(
    setPeople,
    () => (lastSearchContextRef.current?.query === peopleQuery ? lastSearchContextRef.current : null),
  );

  const recentEnabledRef = useRef(false);
  recentEnabledRef.current = postingFeedEnabled && canUseRecentSearches;
  const recorderRef = useRef<ReturnType<typeof createRecentSearchRecorder> | null>(null);
  if (!recorderRef.current) {
    recorderRef.current = createRecentSearchRecorder({
      enabled: () => recentEnabledRef.current,
      record: (value) => void recordRecentSearch(value),
    });
  }
  const recorder = recorderRef.current;

  // Load recent searches when the empty field gains focus.
  useEffect(() => {
    if (!postingFeedEnabled || !canUseRecentSearches || normalizedQuery || !isFocused) return;
    let cancelled = false;
    void fetchRecentSearches().then((entries) => {
      if (!cancelled) setRecent(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [postingFeedEnabled, canUseRecentSearches, normalizedQuery, isFocused]);

  const runPeopleSearch = useCallback(async (searchQuery: string, seq: number, analyticsSeq: number) => {
    const startedAt = performance.now();
    const searchProperties = await buildSearchAnalyticsProperties(searchQuery);
    captureMingleClientEvent("mingle_connect_search_requested", {
      search_sequence: analyticsSeq,
      ...searchProperties,
    });
    let httpStatus: number | null = null;
    try {
      const params = new URLSearchParams({ q: searchQuery });
      const response = await fetch(buildClientApiPath(`/users/search?${params.toString()}`), {
        cache: "no-store",
        headers: buildConnectTrackingHeaders(),
      });
      httpStatus = response.status;
      if (!response.ok) throw new Error("people_search_failed");
      const payload = (await response.json()) as { users?: ConnectSearchResult[]; nextCursor?: unknown };
      const users = Array.isArray(payload.users)
        ? payload.users.filter((user) => !isSearchExcludedHandle(user.handle))
        : [];
      const hasMore = users.length > PEOPLE_PREVIEW_LIMIT || typeof payload.nextCursor === "string";
      captureMingleClientEvent("mingle_connect_search_completed", {
        search_sequence: analyticsSeq,
        success: true,
        http_status: httpStatus,
        result_count: users.length,
        has_more: hasMore,
        load_more: false,
        duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
        ...searchProperties,
      });
      if (!shouldApplyResponse({
        responseSequence: seq,
        latestSequence: searchSeqRef.current,
        responseQuery: searchQuery,
        activeQuery: activeQueryRef.current,
      })) return;
      const preview = users.slice(0, PEOPLE_PREVIEW_LIMIT);
      setPeople(preview);
      setHasMorePeople(hasMore);
      setPeopleQuery(searchQuery);
      rememberPeopleSnapshot({ query: searchQuery, people: preview, hasMore });
      lastSearchContextRef.current = { query: searchQuery, sequence: analyticsSeq, properties: searchProperties };
    } catch {
      // A failed request is shown as "no results", no error/retry UI.
      captureMingleClientEvent("mingle_connect_search_completed", {
        search_sequence: analyticsSeq,
        success: false,
        http_status: httpStatus,
        result_count: 0,
        has_more: false,
        load_more: false,
        duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
        ...searchProperties,
      });
      if (!shouldApplyResponse({
        responseSequence: seq,
        latestSequence: searchSeqRef.current,
        responseQuery: searchQuery,
        activeQuery: activeQueryRef.current,
      })) return;
      setPeople([]);
      setHasMorePeople(false);
      setPeopleQuery(searchQuery);
    } finally {
      if (searchSeqRef.current === seq) setIsSearching(false);
    }
  }, []);

  const handleDispatch = useCallback((searchQuery: string) => {
    activeQueryRef.current = searchQuery;
    setDispatchedQuery(searchQuery);
    if (!searchQuery) {
      searchSeqRef.current += 1;
      setPeople([]);
      setPeopleQuery("");
      setHasMorePeople(false);
      setIsSearching(false);
      return;
    }
    const seq = ++searchSeqRef.current;
    const analyticsSeq = ++analyticsSeqRef.current;
    setIsSearching(true);
    void runPeopleSearch(searchQuery, seq, analyticsSeq);
  }, [runPeopleSearch]);

  // One controller owns debounce + IME composition for people AND posts.
  const handleDispatchRef = useRef(handleDispatch);
  handleDispatchRef.current = handleDispatch;
  const controllerRef = useRef<SearchInputController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createSearchInputController({
      onDispatch: (value) => handleDispatchRef.current(value),
    });
    controllerRef.current.prime(initialQuery);
  }
  const controller = controllerRef.current;
  useEffect(() => () => controller.dispose(), [controller]);

  // Returning to a search: refetch people only when no snapshot was kept.
  useEffect(() => {
    if (!initialQuery) return;
    if (initialPeople) {
      void buildSearchAnalyticsProperties(initialQuery).then((properties) => {
        lastSearchContextRef.current ??= { query: initialQuery, sequence: 0, properties };
      });
      return;
    }
    const seq = ++searchSeqRef.current;
    const analyticsSeq = ++analyticsSeqRef.current;
    setIsSearching(true);
    void runPeopleSearch(initialQuery, seq, analyticsSeq);
  }, [initialQuery, initialPeople, runPeopleSearch]);

  // A query set by the parent (not typed here) still goes through the controller.
  const lastFedQueryRef = useRef(query);
  useEffect(() => {
    if (query === lastFedQueryRef.current) return;
    lastFedQueryRef.current = query;
    controller.setValue(query);
  }, [query, controller]);
  const feedInput = useCallback((value: string, kind: "change" | "compositionEnd") => {
    lastFedQueryRef.current = value;
    onQueryChange(value);
    if (kind === "compositionEnd") controller.compositionEnd(value);
    else controller.setValue(value);
  }, [controller, onQueryChange]);

  const showPostGrid = postingFeedEnabled && Boolean(normalizedQuery) && Boolean(dispatchedQuery);
  const showPeople = normalizedQuery ? people : [];
  const showRecent = postingFeedEnabled && canUseRecentSearches && !normalizedQuery && recent.length > 0;
  const showNoResults = shouldShowNoResults({
    query: normalizedQuery,
    dispatchedQuery,
    peopleSettledQuery: peopleQuery,
    peopleCount: people.length,
    // Posting feed off: the surface is people-only, so posts count as empty.
    postsSettledEmpty: postingFeedEnabled ? postsEmpty : true,
  });

  // Track which query has results on screen, for "record on leave".
  const postsShown = showPostGrid && !postsEmpty && !postsLoading;
  const hasShownResults = Boolean(dispatchedQuery)
    && ((peopleQuery === dispatchedQuery && people.length > 0) || postsShown);
  useEffect(() => {
    recorder.setShownResults(dispatchedQuery, hasShownResults);
  }, [recorder, dispatchedQuery, hasShownResults]);
  useEffect(() => {
    const onPageHide = () => recorder.commitOnLeave();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      recorder.commitOnLeave();
    };
  }, [recorder]);

  const handleRecentTap = useCallback((value: string) => {
    feedInput(value, "change");
    controller.flush();
    recorder.commit(value);
    inputRef.current?.focus({ preventScroll: true });
  }, [controller, feedInput, recorder]);

  const openPerson = useCallback((userId: string) => {
    recorder.commit(dispatchedQuery);
    onOpenPerson(userId);
  }, [dispatchedQuery, onOpenPerson, recorder]);

  return (
    <div className="unified-search flex h-full min-h-0 flex-col">
      <div
        className="shrink-0 px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 44px) + 12px)" }}
      >
        <form
          role="search"
          className="relative block"
          onSubmit={(event) => {
            event.preventDefault();
            controller.flush();
            recorder.commit(normalizedQuery);
            inputRef.current?.blur();
          }}
        >
          <Search size={19} strokeWidth={2.1} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => feedInput(event.target.value, "change")}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onCompositionStart={() => controller.compositionStart()}
            onCompositionEnd={(event) => feedInput(event.currentTarget.value, "compositionEnd")}
            placeholder={copy.searchPlaceholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label={copy.searchPlaceholder}
            className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-10 text-[15px] text-slate-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-amber-100"
          />
          {isSearching || (showPostGrid && postsLoading) ? (
            <Loader2 size={16} className="absolute right-10 top-1/2 -translate-y-1/2 animate-spin text-gray-400" aria-label={copy.searching} />
          ) : null}
          {query ? (
            <button
              type="button"
              onClick={() => { feedInput("", "change"); inputRef.current?.focus({ preventScroll: true }); }}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition active:bg-gray-200"
              aria-label={copy.clearSearch}
            >
              <X size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : null}
        </form>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {showRecent ? (
          <RecentSearches
            copy={copy}
            recent={recent}
            onPick={handleRecentTap}
            onRemove={(value) => void deleteRecentSearch(value).then(setRecent)}
            onClearAll={() => void clearAllRecentSearches().then(setRecent)}
          />
        ) : null}

        {normalizedQuery ? (
          <>
            {showPeople.length > 0 ? (
              <section className="border-b border-gray-100 pb-2" aria-label={copy.peopleHeading}>
                <div className="flex items-center justify-between px-4 pb-1 pt-3">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">{copy.peopleHeading}</h2>
                  {hasMorePeople ? (
                    <button
                      type="button"
                      onClick={() => {
                        recorder.commit(peopleQuery);
                        onSeeAllPeople(peopleQuery);
                      }}
                      className="rounded-md px-2 py-1 text-[13px] font-semibold text-amber-700 transition active:bg-amber-50"
                    >
                      {copy.seeAllPeople}
                    </button>
                  ) : null}
                </div>
                <ul>
                  {showPeople.map((person, index) => (
                    <PersonRow
                      key={person.id}
                      person={person}
                      labels={{ userFallback: copy.userFallback, follow: copy.follow, following: copy.following }}
                      onOpen={openPerson}
                      canFollow={Boolean(currentUserId) && person.id !== currentUserId}
                      isFollowPending={followInFlightIds.has(person.id)}
                      onToggleFollow={() => void toggleFollow(person, index, showPeople.length)}
                    />
                  ))}
                </ul>
                {followError ? (
                  <p className="px-4 pt-1 text-[13px] text-red-500" role="alert">{copy.followError}</p>
                ) : null}
              </section>
            ) : null}

            {showPostGrid ? (
              <section className="px-0.5 pt-2" aria-label={copy.postsHeading}>
                {!postsEmpty ? (
                  <h2 className="px-3.5 pb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">{copy.postsHeading}</h2>
                ) : null}
                <PostGrid
                  locale={locale}
                  endpoint={feedSourceEndpoint({ kind: "search", query: dispatchedQuery }, { limit: 18, displayLanguage })}
                  displayLanguage={displayLanguage}
                  scrollScope={`search-posts:${dispatchedQuery}`}
                  onSelectPost={(postId) => {
                    recorder.commit(dispatchedQuery);
                    onOpenSearchPost(dispatchedQuery, postId);
                  }}
                  scrollContainerRef={scrollRef}
                  onEmptyStateChange={setPostsEmpty}
                  onLoadingChange={setPostsLoading}
                  keepPreviousWhileLoading
                  cacheResults
                />
              </section>
            ) : null}

            {showNoResults ? (
              <p className="px-6 pt-8 text-center text-[14px] text-gray-500" aria-live="polite">
                {copy.noResults}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function RecentSearches({
  copy,
  recent,
  onPick,
  onRemove,
  onClearAll,
}: {
  copy: ReturnType<typeof searchCopy>;
  recent: RecentSearch[];
  onPick: (query: string) => void;
  onRemove: (query: string) => void;
  onClearAll: () => void;
}) {
  return (
    <section className="px-2 pt-2" aria-label={copy.recentHeading}>
      <div className="flex items-center justify-between px-2 pb-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">{copy.recentHeading}</h2>
        <button
          type="button"
          onClick={onClearAll}
          className="rounded-md px-2 py-1 text-[13px] font-semibold text-gray-500 transition active:bg-gray-100"
        >
          {copy.clearAllRecent}
        </button>
      </div>
      <ul>
        {recent.map((entry) => (
          <li key={entry.query} className="flex items-center gap-2 px-2 py-1.5">
            <button
              type="button"
              onClick={() => onPick(entry.query)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition active:bg-gray-50"
            >
              <Search size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
              <span className="truncate text-[15px] text-slate-800">{entry.query}</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(entry.query)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition active:bg-gray-200"
              aria-label={`${copy.removeRecent}: ${entry.query}`}
            >
              <X size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
