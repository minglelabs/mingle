"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import type { AppLocale } from "@/i18n";
import { buildClientApiPath } from "@/lib/api-contract";
import { searchCopy } from "@/i18n/search-copy";
import { formatHandle, isSearchExcludedHandle } from "@/lib/handles";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import type { ConnectSearchResult } from "@/components/connect-search-cache";

/**
 * The full people list for a search ("See all"). Reached from the unified
 * search people preview; the same `/users/search` endpoint with cursor
 * pagination and additional loading on scroll. Selecting a person is delegated
 * so the caller opens the existing profile and can restore afterwards.
 */
export type SearchPeopleScreenProps = {
  locale: AppLocale;
  query: string;
  onOpenPerson: (userId: string) => void;
};

export default function SearchPeopleScreen({ locale, query, onOpenPerson }: SearchPeopleScreenProps) {
  const copy = searchCopy(locale);
  const normalizedQuery = query.trim();
  const [people, setPeople] = useState<ConnectSearchResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const seqRef = useRef(0);

  const fetchPage = useCallback(async (pageCursor: string | null) => {
    if (!normalizedQuery) return;
    const seq = ++seqRef.current;
    try {
      const params = new URLSearchParams({ q: normalizedQuery });
      if (pageCursor) params.set("cursor", pageCursor);
      const response = await fetch(buildClientApiPath(`/users/search?${params.toString()}`), { cache: "no-store" });
      if (!response.ok) throw new Error("people_search_failed");
      const payload = (await response.json()) as { users?: ConnectSearchResult[]; nextCursor?: unknown };
      if (seqRef.current !== seq) return;
      const users = Array.isArray(payload.users)
        ? payload.users.filter((user) => !isSearchExcludedHandle(user.handle))
        : [];
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
    <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto overscroll-y-contain bg-white">
      {status === "ready" && people.length === 0 ? (
        <p className="px-6 pt-8 text-center text-[14px] text-gray-500" aria-live="polite">{copy.noResults}</p>
      ) : (
        <ul className="border-t border-gray-100" aria-label={copy.peopleScreenTitle}>
          {people.map((person) => {
            const profileName = person.name?.trim() || "";
            const rawHandle = person.handle?.trim() || "";
            const formattedHandle = formatHandle(rawHandle);
            const name = profileName || rawHandle || copy.userFallback;
            const showHandle = Boolean(formattedHandle && profileName
              && profileName.replace(/^@/, "").toLocaleLowerCase() !== rawHandle.toLocaleLowerCase());
            return (
              <li key={person.id} className="border-b border-gray-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => onOpenPerson(person.id)}
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
          })}
        </ul>
      )}
      {cursor ? (
        <div ref={sentinelRef} className="flex justify-center py-4 text-gray-400">
          {isLoadingMore ? <Loader2 size={18} className="animate-spin" aria-label={copy.loadMore} /> : <span className="h-px w-full" />}
        </div>
      ) : null}
    </div>
  );
}
