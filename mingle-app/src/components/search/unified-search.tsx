"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, UserRound, X } from "lucide-react";
import type { AppLocale } from "@/i18n";
import { buildClientApiPath, clientApiNamespace, clientSupportsPostingFeed } from "@/lib/api-contract";
import { getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { buildSearchAnalyticsProperties } from "@/lib/search-analytics";
import { searchCopy } from "@/i18n/search-copy";
import { feedSourceEndpoint } from "@/lib/feed-routes";
import { formatHandle, isSearchExcludedHandle } from "@/lib/handles";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import type { ConnectSearchResult } from "@/components/connect-search-cache";
import PostGrid from "./post-grid";
import {
  resolveResultsRetention,
  shouldApplyResponse,
  shouldDispatchSearch,
  SEARCH_DEBOUNCE_MS,
} from "./unified-search-logic";
import {
  clearAllRecentSearches,
  deleteRecentSearch,
  fetchRecentSearches,
  recordRecentSearch,
  type RecentSearch,
} from "./recent-searches-client";

const PEOPLE_PREVIEW_LIMIT = 3;

/** Same request headers the legacy connect search sent, for PostHog attribution. */
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

export type UnifiedSearchProps = {
  locale: AppLocale;
  displayLanguage?: string | null;
  /** Whether recent searches may be shown (signed-out hides them). */
  canUseRecentSearches: boolean;
  /** Open a person's profile (people result / see-all). */
  onOpenPerson: (userId: string) => void;
  /** Open a post in the search viewer, scoped to this query's results. */
  onOpenSearchPost: (query: string, postId: string) => void;
  /** Open the full sliding people-list screen ("see all"). */
  onSeeAllPeople: (query: string) => void;
  /** Controlled query so the parent can restore it on back-navigation. Omit for uncontrolled. */
  query?: string;
  onQueryChange?: (query: string) => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
};

export default function UnifiedSearch({
  locale,
  displayLanguage,
  canUseRecentSearches,
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
  const composingRef = useRef(false);
  const searchSeqRef = useRef(0);
  const analyticsSeqRef = useRef(0);
  const activeQueryRef = useRef("");
  const recordedRef = useRef<Set<string>>(new Set());

  const [people, setPeople] = useState<ConnectSearchResult[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [hasMorePeople, setHasMorePeople] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [postsEmpty, setPostsEmpty] = useState(false);

  const normalizedQuery = query.trim();

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
      setPeople(users.slice(0, PEOPLE_PREVIEW_LIMIT));
      setHasMorePeople(hasMore);
      setPeopleQuery(searchQuery);
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

  // Debounced search dispatch; IME composition suppresses it until it ends.
  useEffect(() => {
    activeQueryRef.current = normalizedQuery;
    if (!shouldDispatchSearch({ query: normalizedQuery, isComposing: composingRef.current })) {
      if (!normalizedQuery) {
        setPeople([]);
        setPeopleQuery("");
        setHasMorePeople(false);
        setIsSearching(false);
      }
      return;
    }
    const timer = window.setTimeout(() => {
      const seq = ++searchSeqRef.current;
      const analyticsSeq = ++analyticsSeqRef.current;
      setIsSearching(true);
      void runPeopleSearch(normalizedQuery, seq, analyticsSeq);
      // Record the term once results are being shown for it (posting feed only).
      if (postingFeedEnabled && canUseRecentSearches && !recordedRef.current.has(normalizedQuery)) {
        recordedRef.current.add(normalizedQuery);
        void recordRecentSearch(normalizedQuery);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [normalizedQuery, runPeopleSearch, canUseRecentSearches, postingFeedEnabled]);

  const retention = resolveResultsRetention({
    currentResultsQuery: peopleQuery,
    pendingQuery: normalizedQuery,
    hasCurrentResults: people.length > 0,
  });
  const showPeople = peopleQuery === normalizedQuery ? people : (retention.keepCurrentResults ? people : []);
  const showPostGrid = postingFeedEnabled && Boolean(normalizedQuery);
  const showRecent = postingFeedEnabled && canUseRecentSearches && !normalizedQuery && recent.length > 0;
  // When posting feed is off, the surface is people-only (like the legacy search):
  // show a people-only "no results" once the search settled with nothing.
  const showPeopleOnlyNoResults = !postingFeedEnabled
    && Boolean(normalizedQuery)
    && peopleQuery === normalizedQuery
    && showPeople.length === 0;

  const handleRecentTap = useCallback((value: string) => {
    onQueryChange(value);
    inputRef.current?.focus({ preventScroll: true });
  }, [onQueryChange]);

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
            inputRef.current?.blur();
          }}
        >
          <Search size={19} strokeWidth={2.1} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              // Sync the committed composition so the debounce effect re-runs.
              onQueryChange(event.currentTarget.value);
            }}
            placeholder={copy.searchPlaceholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label={copy.searchPlaceholder}
            className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-10 text-[15px] text-slate-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-amber-100"
          />
          {isSearching ? (
            <Loader2 size={16} className="absolute right-10 top-1/2 -translate-y-1/2 animate-spin text-gray-400" aria-label={copy.searching} />
          ) : null}
          {query ? (
            <button
              type="button"
              onClick={() => { onQueryChange(""); inputRef.current?.focus({ preventScroll: true }); }}
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
                      onClick={() => onSeeAllPeople(normalizedQuery)}
                      className="rounded-md px-2 py-1 text-[13px] font-semibold text-amber-700 transition active:bg-amber-50"
                    >
                      {copy.seeAllPeople}
                    </button>
                  ) : null}
                </div>
                <ul>
                  {showPeople.map((person) => (
                    <PersonRow key={person.id} person={person} fallback={copy.userFallback} onOpen={onOpenPerson} />
                  ))}
                </ul>
              </section>
            ) : null}

            {showPostGrid ? (
              <>
                <section className="px-0.5 pt-2" aria-label={copy.postsHeading}>
                  {!postsEmpty ? (
                    <h2 className="px-3.5 pb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">{copy.postsHeading}</h2>
                  ) : null}
                  <PostGrid
                    locale={locale}
                    endpoint={feedSourceEndpoint({ kind: "search", query: normalizedQuery }, { limit: 18, displayLanguage })}
                    displayLanguage={displayLanguage}
                    scrollScope={`search-posts:${normalizedQuery}`}
                    onSelectPost={(postId) => onOpenSearchPost(normalizedQuery, postId)}
                    scrollContainerRef={scrollRef}
                    onEmptyStateChange={setPostsEmpty}
                  />
                </section>

                {postsEmpty && showPeople.length === 0 ? (
                  <p className="px-6 pt-8 text-center text-[14px] text-gray-500" aria-live="polite">
                    {copy.noResults}
                  </p>
                ) : null}
              </>
            ) : showPeopleOnlyNoResults ? (
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

function PersonRow({
  person,
  fallback,
  onOpen,
}: {
  person: ConnectSearchResult;
  fallback: string;
  onOpen: (userId: string) => void;
}) {
  const profileName = person.name?.trim() || "";
  const rawHandle = person.handle?.trim() || "";
  const formattedHandle = formatHandle(rawHandle);
  const name = profileName || rawHandle || fallback;
  const showHandle = Boolean(formattedHandle && profileName
    && profileName.replace(/^@/, "").toLocaleLowerCase() !== rawHandle.toLocaleLowerCase());

  return (
    <li className="px-4 py-2.5">
      <button
        type="button"
        onClick={() => onOpen(person.id)}
        className="flex min-w-0 items-center gap-3 rounded-xl text-left transition active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
        aria-label={showHandle ? `${name}, ${formattedHandle}` : name}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
          {person.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.image}
              alt=""
              className="h-full w-full object-cover"
              style={{ transform: buildProfileImageTransform(44, {
                scale: person.imageCropScale,
                x: person.imageCropX,
                y: person.imageCropY,
              }) }}
            />
          ) : (
            <UserRound size={24} className="text-gray-400" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-slate-900">{name}</span>
          {showHandle ? <span className="block truncate text-[13px] text-gray-500">{formattedHandle}</span> : null}
        </span>
      </button>
    </li>
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
