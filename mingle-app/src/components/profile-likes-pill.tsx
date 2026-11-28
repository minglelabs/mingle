"use client";

import { ChevronRight, Heart, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveProfileLikesCopy } from "@/i18n/profile-likes-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

type Liker = { id: string; name: string | null; handle: string | null; image: string | null };

function Face({ person, size }: { person: Liker; size: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-gray-400 ring-2 ring-white" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {person.image ? <img src={person.image} alt="" className="h-full w-full object-cover" draggable={false} /> : <UserRound size={size * 0.55} aria-hidden="true" />}
    </span>
  );
}

/**
 * The hearts this account got on its profile (owner, 2026-11-25), under the
 * name on My page: a pill with a heart, the number and the last two faces.
 * Tapping it lists who sent them; a person opens their profile. Nothing at
 * all while there are none.
 */
export default function ProfileLikesPill({ locale }: { locale: string }) {
  const router = useRouter();
  const copy = useMemo(() => resolveProfileLikesCopy(locale), [locale]);
  const [people, setPeople] = useState<Liker[] | null>(null);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  // The list has no end (owner, 2026-11-28): the next page loads near the bottom of the sheet.
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  useNativeBannerSuppression(open);

  const readPage = useCallback(async (cursor: string | null) => {
    const response = await fetch(`${buildClientApiPath("/profile/likes")}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
    const body = (response.ok ? await response.json() : null) as { count?: unknown; people?: unknown; nextCursor?: unknown } | null;
    if (!body || !Array.isArray(body.people)) return null;
    const list = (body.people as Array<Partial<Liker>>).flatMap((row): Liker[] => (
      typeof row?.id === "string" ? [{ id: row.id, name: row.name ?? null, handle: row.handle ?? null, image: row.image ?? null }] : []
    ));
    return { list, count: typeof body.count === "number" ? body.count : null, nextCursor: typeof body.nextCursor === "string" ? body.nextCursor : null };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readPage(null)
      .then((page) => {
        if (cancelled || !page) return;
        setPeople(page.list);
        setCount(page.count ?? page.list.length);
        setNextCursor(page.nextCursor);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [readPage]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    void readPage(nextCursor)
      .then((page) => {
        if (!page) return;
        setPeople((current) => {
          const seen = new Set((current ?? []).map((person) => person.id));
          return [...(current ?? []), ...page.list.filter((person) => !seen.has(person.id))];
        });
        if (page.count !== null) setCount(page.count);
        setNextCursor(page.nextCursor);
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [loadingMore, nextCursor, readPage]);

  if (!people || people.length === 0) return null;

  return (
    <>
      <button
        type="button"
        data-qa="profile-likes-pill"
        onClick={() => setOpen(true)}
        aria-label={`${copy.listTitle} ${count}`}
        className="mt-2 inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white pl-3 pr-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition active:bg-gray-50"
      >
        <Heart size={18} strokeWidth={2.2} className="fill-rose-500 text-rose-500" aria-hidden="true" />
        <span className="text-[15px] font-bold tabular-nums text-slate-900">{count}</span>
        <span className="flex -space-x-2">
          {people.slice(0, 2).map((person) => <Face key={person.id} person={person} size={24} />)}
        </span>
        <ChevronRight size={16} strokeWidth={2.4} className="text-gray-400" aria-hidden="true" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-[230] flex items-end bg-slate-950/40" role="dialog" aria-modal="true" aria-label={copy.listTitle} onClick={() => setOpen(false)}>
          <div
            data-qa="profile-likes-sheet"
            className="flex max-h-[70vh] w-full flex-col rounded-t-[1.6rem] bg-white px-5 pt-4"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 8px))" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[1.05rem] font-extrabold text-slate-950">
                <Heart size={17} className="fill-rose-500 text-rose-500" aria-hidden="true" />
                {copy.listTitle}
                <span className="text-rose-500">{count}</span>
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={copy.close} className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <X size={17} strokeWidth={2.6} aria-hidden="true" />
              </button>
            </div>
            <ul
              className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain"
              onScroll={(event) => {
                const list = event.currentTarget;
                if (list.scrollHeight - list.scrollTop - list.clientHeight < 240) loadMore();
              }}
            >
              {people.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    data-qa="profile-likes-person"
                    onClick={() => router.push(`/${locale}/users/${encodeURIComponent(person.id)}`)}
                    className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left active:bg-gray-50"
                  >
                    <Face person={person} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-900">{person.name || person.handle || ""}</span>
                      {person.handle ? <span className="block truncate text-[13px] text-gray-500">@{person.handle}</span> : null}
                    </span>
                    <ChevronRight size={16} strokeWidth={2.4} className="shrink-0 text-gray-300" aria-hidden="true" />
                  </button>
                </li>
              ))}
              {nextCursor ? (
                <li className="flex justify-center py-3" aria-hidden="true">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
