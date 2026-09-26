"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import type { AppLocale } from "@/i18n";
import { buildClientApiPath } from "@/lib/api-contract";
import { buildSearchAnalyticsProperties } from "@/lib/search-analytics";
import { searchCopy } from "@/i18n/search-copy";
import { isSearchExcludedHandle } from "@/lib/handles";
import type { ConnectSearchResult } from "@/components/connect-search-cache";
import { buildConnectTrackingHeaders, PersonRow, usePeopleFollow, type PeopleSearchContext } from "./people-follow";

/**
 * The full people list for a search ("See all"). Reached from the unified
 * search people preview; the same `/users/search` endpoint with cursor
 * pagination and additional loading on scroll. Each row carries the same inline
 * follow toggle (and PostHog events) as the preview. Selecting a person is
 * delegated so the caller opens the existing profile and can restore afterwards.
 * The screen has its own header (title + back); the host decides how it is
 * presented (a sliding surface on the connect tab, or a standalone route).
 */
export type SearchPeopleScreenProps = {
  locale: AppLocale;
  query: string;
  onOpenPerson: (userId: string) => void;
  onBack: () => void;
};

export default function SearchPeopleScreen({ locale, query, onOpenPerson, onBack }: SearchPeopleScreenProps) {
  const copy = searchCopy(locale);
  const { data: session } = useSession();
  const currentUserId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  const normalizedQuery = query.trim();
  const [people, setPeople] = useState<ConnectSearchResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const seqRef = useRef(0);
  const searchContextRef = useRef<PeopleSearchContext>(null);
  const { followInFlightIds, followError, toggleFollow } = usePeopleFollow(
    setPeople,
    () => searchContextRef.current,
  );

  const fetchPage = useCallback(async (pageCursor: string | null) => {
    if (!normalizedQuery) return;
    const seq = ++seqRef.current;
    try {
      const params = new URLSearchParams({ q: normalizedQuery });
      if (pageCursor) params.set("cursor", pageCursor);
      const response = await fetch(buildClientApiPath(`/users/search?${params.toString()}`), {
        cache: "no-store",
        headers: buildConnectTrackingHeaders(),
      });
      if (!response.ok) throw new Error("people_search_failed");
      const payload = (await response.json()) as { users?: ConnectSearchResult[]; nextCursor?: unknown };
      if (seqRef.current !== seq) return;
      const users = Array.isArray(payload.users)
        ? payload.users.filter((user) => !isSearchExcludedHandle(user.handle))
        : [];
      if (!pageCursor) {
        searchContextRef.current = {
          query: normalizedQuery,
          sequence: 0,
          properties: await buildSearchAnalyticsProperties(normalizedQuery),
        };
      }
      setPeople((current) => {
        if (!pageCursor) return users;
        const seen = new Set(current.map((user) => user.id));
        return [...current, ...users.filter((user) => !seen.has(user.id))];
      });
      setCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
      setStatus("ready");
    } catch {
      if (seqRef.current !== seq) return;
      if (!pageCursor) setPeople([]);
      setCursor(null);
      setStatus("ready");
    }
  }, [normalizedQuery]);

  useEffect(() => {
    setPeople([]);
    setCursor(null);
    setStatus("loading");
    void fetchPage(null);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      await fetchPage(cursor);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [cursor, fetchPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { root: scrollRef.current, rootMargin: "280px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <header
        className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center px-4"
        style={{
          height: "calc(54px + env(safe-area-inset-top, 44px))",
          paddingTop: "env(safe-area-inset-top, 44px)",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
          aria-label={copy.back}
        >
          <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
        </button>
        <h1 className="min-w-0 truncate text-center text-[17px] font-bold">
          {copy.peopleScreenTitle}
          {normalizedQuery ? <span className="ml-1.5 font-normal text-gray-500">{normalizedQuery}</span> : null}
        </h1>
        <div aria-hidden="true" />
      </header>
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-white">
      {status === "ready" && people.length === 0 ? (
        <p className="px-6 pt-8 text-center text-[14px] text-gray-500" aria-live="polite">{copy.noResults}</p>
      ) : (
        <>
          <ul className="border-t border-gray-100" aria-label={copy.peopleScreenTitle}>
            {people.map((person, index) => (
              <PersonRow
                key={person.id}
                person={person}
                labels={{ userFallback: copy.userFallback, follow: copy.follow, following: copy.following }}
                onOpen={onOpenPerson}
                canFollow={Boolean(currentUserId) && person.id !== currentUserId}
                isFollowPending={followInFlightIds.has(person.id)}
                onToggleFollow={() => void toggleFollow(person, index, people.length)}
                className="border-b border-gray-100 px-4 py-3"
              />
            ))}
          </ul>
          {followError ? (
            <p className="px-4 pt-1 text-[13px] text-red-500" role="alert">{copy.followError}</p>
          ) : null}
        </>
      )}
      {cursor ? (
        <div ref={sentinelRef} className="flex justify-center py-4 text-gray-400">
          {isLoadingMore ? <Loader2 size={18} className="animate-spin" aria-label={copy.loadMore} /> : <span className="h-px w-full" />}
        </div>
      ) : null}
    </div>
    </div>
  );
}
