"use client";

import { ChevronLeft, ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SlideSurface from "@/components/slide-surface";
import { fillHomeCount, resolveHomeCopy, BAN_NOTICE_CATEGORIES, type BanNoticeCategory } from "@/i18n/home-copy";
import { buildClientApiPath } from "@/lib/api-contract";

export type HomeNotice =
  | { id: string; kind: "ban"; maskedName: string; category: BanNoticeCategory; publishedAt: string }
  | { id: string; kind: "general"; title: string; body: string; isImportant: boolean; publishedAt: string };

/** Tolerant reader for `GET /notices?view=list`; drops rows it does not understand. */
export function parseHomeNotices(payload: unknown): HomeNotice[] {
  const raw = (payload && typeof payload === "object" ? (payload as { notices?: unknown }).notices : null);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): HomeNotice[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.publishedAt !== "string") return [];
    if (row.kind === "ban") {
      const category = (BAN_NOTICE_CATEGORIES as readonly string[]).includes(String(row.category)) ? row.category as BanNoticeCategory : "other";
      return [{ id: row.id, kind: "ban", maskedName: typeof row.maskedName === "string" && row.maskedName ? row.maskedName : "***", category, publishedAt: row.publishedAt }];
    }
    if (row.kind === "general") {
      const title = typeof row.title === "string" ? row.title : "";
      const body = typeof row.body === "string" ? row.body : "";
      if (!title && !body) return [];
      return [{ id: row.id, kind: "general", title, body, isImportant: row.isImportant === true, publishedAt: row.publishedAt }];
    }
    return [];
  });
}

/** How many bans the strip shows; 0 (or anything unreadable) hides it. */
export function parseWeekBanCount(payload: unknown): number {
  const value = payload && typeof payload === "object" ? (payload as { weekBanCount?: unknown }).weekBanCount : null;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function formatDay(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(date);
  } catch {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

/**
 * The strip on top of the home tab ("N permanently banned this week") and the
 * notice list it opens. A week without a ban shows no strip at all.
 */
export default function HomeNoticeStrip({ locale }: { locale: string }) {
  const copy = useMemo(() => resolveHomeCopy(locale), [locale]);
  const [weekBanCount, setWeekBanCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<HomeNotice[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${buildClientApiPath("/notices")}?locale=${encodeURIComponent(locale)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (!cancelled) setWeekBanCount(parseWeekBanCount(body)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFailed(false);
    void fetch(`${buildClientApiPath("/notices")}?view=list&locale=${encodeURIComponent(locale)}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("notices_failed");
        return response.json();
      })
      .then((body) => { if (!cancelled) setNotices(parseHomeNotices(body)); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [locale, open]);

  if (weekBanCount <= 0 && !open) return null;

  return (
    <>
      {weekBanCount > 0 ? (
        <button
          type="button"
          data-qa="home-ban-strip"
          onClick={() => setOpen(true)}
          className="mx-3 mb-2 flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-left text-[13px] font-semibold text-white transition active:opacity-80"
        >
          <ShieldAlert size={16} className="shrink-0 text-amber-400" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{fillHomeCount(copy.banStrip, weekBanCount)}</span>
          <ChevronRight size={16} className="shrink-0 text-white/60" aria-hidden="true" />
        </button>
      ) : null}
      <SlideSurface
        open={open}
        ariaLabel={copy.noticesTitle}
        onClose={() => setOpen(false)}
        nativeBackPriority={35}
        className="fixed inset-0 z-[105] flex min-h-0 w-full flex-col overflow-hidden bg-white text-slate-950"
        style={{ touchAction: "pan-y" }}
      >
        <header
          className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center px-4"
          style={{ height: "calc(54px + env(safe-area-inset-top, 44px))", paddingTop: "env(safe-area-inset-top, 44px)" }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
            aria-label={copy.back}
          >
            <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
          </button>
          <h1 className="truncate text-center text-[17px] font-bold">{copy.noticesTitle}</h1>
          <div aria-hidden="true" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
          {failed ? (
            <p className="pt-12 text-center text-[14px] text-gray-500" role="alert">{copy.loadError}</p>
          ) : notices === null ? (
            <div className="flex justify-center pt-12 text-gray-400"><Loader2 size={24} className="animate-spin" aria-hidden="true" /></div>
          ) : notices.length === 0 ? (
            <p className="pt-12 text-center text-[14px] text-gray-500">{copy.noticesEmpty}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {notices.map((notice) => (
                <li key={notice.id} className="py-3.5">
                  {notice.kind === "ban" ? (
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] text-slate-900">
                      <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[12px] font-bold text-rose-600">{copy.banLabel}</span>
                      <span className="font-semibold">{notice.maskedName}</span>
                      <span className="text-gray-300" aria-hidden="true">·</span>
                      <span>{copy.banCategory[notice.category]}</span>
                      <span className="text-gray-300" aria-hidden="true">·</span>
                      <span className="text-gray-500">{formatDay(notice.publishedAt, locale)}</span>
                    </p>
                  ) : (
                    <>
                      <p className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 text-[15px] font-semibold text-slate-900">{notice.title || notice.body}</span>
                        <span className="shrink-0 text-[12px] text-gray-500">{formatDay(notice.publishedAt, locale)}</span>
                      </p>
                      {notice.title && notice.body ? (
                        <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-slate-700">{notice.body}</p>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SlideSurface>
    </>
  );
}
