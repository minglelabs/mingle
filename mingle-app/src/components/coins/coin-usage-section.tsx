"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { buildClientApiPath } from "@/lib/api-contract";
import type { AppLocale } from "@/i18n";
import { resolveLegalDocumentLocale } from "@/i18n/config";
import { getCoinCopy, type CoinCopy } from "@/i18n/coin-copy";

// "How much did I use" (docs/coin-iap-spec.md 9.3): a range summary, a bar per
// kind, a daily bar chart, and a history where usage is folded per conversation.

type UsageRange = "today" | "7d" | "30d";
type UsageKind = "stt" | "translation" | "tts" | "image_text";

type UsageSummary = {
  range: UsageRange;
  totalCoins: number;
  kinds: { kind: UsageKind; coins: number; seconds: number; count: number }[];
  days: { date: string; coins: number }[];
};

type HistoryItem =
  | { id: string; type: "grant"; source: string; coins: number; at: string }
  | {
      id: string;
      type: "usage";
      coins: number;
      at: string;
      conversationTitle: string | null;
      sttSeconds: number;
      breakdown: Partial<Record<UsageKind, number>>;
    }
  | { id: string; type: "removal"; reason: string; coins: number; at: string };

const KIND_ORDER: UsageKind[] = ["stt", "translation", "tts", "image_text"];
const KIND_COLORS: Record<UsageKind, string> = {
  stt: "bg-amber-400",
  translation: "bg-sky-400",
  tts: "bg-violet-400",
  image_text: "bg-emerald-400",
};

function kindLabel(kind: UsageKind, copy: CoinCopy): string {
  return kind === "stt" ? copy.kindStt : kind === "translation" ? copy.kindTranslation : kind === "tts" ? copy.kindTts : copy.kindImageText;
}

function grantLabel(source: string, copy: CoinCopy): string {
  if (source === "daily_free") return copy.sourceDailyFree;
  if (source === "purchase") return copy.sourcePurchase;
  if (source === "signup_bonus") return copy.sourceBonus;
  if (source === "refund_reversal") return copy.sourceRefund;
  return copy.sourceAdmin;
}

function removalLabel(reason: string, copy: CoinCopy): string {
  if (reason === "expire") return copy.sourceExpired;
  if (reason === "refund_clawback") return copy.sourceRefund;
  return copy.sourceAdmin;
}

function formatCoins(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 2 : 0 }).format(value);
}

function formatMinutes(seconds: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "short", maximumFractionDigits: 0 })
    .format(Math.max(1, Math.round(seconds / 60)));
}

export default function CoinUsageSection({ locale }: { locale: AppLocale }) {
  const copy = getCoinCopy(locale);
  const displayLocale = resolveLegalDocumentLocale(locale);
  const [range, setRange] = useState<UsageRange>("7d");
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "more">("loading");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Minutes east of UTC, so "today" starts at the user's midnight.
    const tz = -new Date().getTimezoneOffset();
    void fetch(buildClientApiPath(`/coins/usage?range=${range}&tz=${tz}`), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() as Promise<UsageSummary> : null))
      .then((data) => {
        if (!cancelled && data) setSummary(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [range]);

  const loadHistory = useCallback(async (from: string | null) => {
    try {
      const query = from ? `?cursor=${encodeURIComponent(from)}` : "";
      const response = await fetch(buildClientApiPath(`/coins/history${query}`), { cache: "no-store" });
      if (!response.ok) throw new Error("coin_history_load_failed");
      const data = await response.json() as { items: HistoryItem[]; nextCursor: string | null };
      setItems((current) => (from ? [...current, ...data.items] : data.items));
      setCursor(data.nextCursor);
    } catch {
      // The list simply stays as it is; the summary above is independent.
    } finally {
      setHistoryState("ready");
    }
  }, []);

  useEffect(() => {
    void loadHistory(null);
  }, [loadHistory]);

  const maxKindCoins = Math.max(1, ...(summary?.kinds.map((entry) => entry.coins) ?? []));
  const maxDayCoins = Math.max(1, ...(summary?.days.map((entry) => entry.coins) ?? []));
  const dateFormatter = new Intl.DateTimeFormat(displayLocale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const ranges: { key: UsageRange; label: string }[] = [
    { key: "today", label: copy.rangeToday },
    { key: "7d", label: copy.range7d },
    { key: "30d", label: copy.range30d },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold text-gray-500">{copy.usedCoins}</p>
          <div className="flex rounded-full bg-white p-0.5" role="tablist">
            {ranges.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={range === entry.key}
                onClick={() => setRange(entry.key)}
                className={`min-h-8 rounded-full px-3 text-[12px] font-semibold transition ${
                  range === entry.key ? "bg-slate-900 text-white" : "text-gray-500"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[28px] font-bold tabular-nums text-slate-950">
          {summary ? formatCoins(summary.totalCoins, displayLocale) : "–"}
        </p>

        <ul className="mt-3 space-y-2.5">
          {KIND_ORDER.map((kind) => {
            const entry = summary?.kinds.find((candidate) => candidate.kind === kind);
            const coins = entry?.coins ?? 0;
            const detail = !entry || entry.count === 0
              ? ""
              : kind === "stt"
                ? formatMinutes(entry.seconds, displayLocale)
                : new Intl.NumberFormat(displayLocale).format(entry.count);
            return (
              <li key={kind}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="font-semibold text-slate-800">{kindLabel(kind, copy)}</span>
                  <span className="tabular-nums text-gray-500">
                    {detail ? `${detail} · ` : ""}
                    <span className="font-semibold text-slate-900">{formatCoins(coins, displayLocale)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div className={`h-full rounded-full ${KIND_COLORS[kind]}`} style={{ width: `${Math.round((coins / maxKindCoins) * 100)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>

        {summary && summary.days.length > 1 ? (
          <div className="mt-4 flex h-16 items-end gap-[3px]" aria-hidden="true">
            {summary.days.map((day) => (
              <div
                key={day.date}
                className="min-w-0 flex-1 rounded-t bg-amber-300"
                style={{ height: `${Math.max(day.coins > 0 ? 6 : 2, Math.round((day.coins / maxDayCoins) * 100))}%` }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <section>
        <h3 className="mb-2 text-[14px] font-bold text-slate-900">{copy.history}</h3>
        {historyState === "loading" ? (
          <div className="flex justify-center py-6 text-gray-400"><Loader2 size={22} className="animate-spin" aria-hidden="true" /></div>
        ) : items.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">{copy.noHistory}</p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
            {items.map((item, index) => {
              const border = index < items.length - 1 ? "border-b border-gray-100" : "";
              const when = dateFormatter.format(new Date(item.at));
              if (item.type !== "usage") {
                const positive = item.type === "grant";
                return (
                  <li key={item.id} className={`flex items-center gap-3 px-4 py-3 ${border}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-slate-900">
                        {positive ? grantLabel(item.source, copy) : removalLabel(item.reason, copy)}
                      </p>
                      <p className="text-[12px] text-gray-500">{when}</p>
                    </div>
                    <span className={`shrink-0 text-[14px] font-bold tabular-nums ${positive ? "text-emerald-600" : "text-slate-900"}`}>
                      {positive ? "+" : "−"}{formatCoins(item.coins, displayLocale)}
                    </span>
                  </li>
                );
              }
              const open = expanded === item.id;
              return (
                <li key={item.id} className={border}>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : item.id)}
                    aria-expanded={open}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition active:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-slate-900">
                        {item.conversationTitle || copy.conversationFallback}
                        {item.sttSeconds > 0 ? ` · ${formatMinutes(item.sttSeconds, displayLocale)}` : ""}
                      </p>
                      <p className="text-[12px] text-gray-500">{when}</p>
                    </div>
                    <span className="shrink-0 text-[14px] font-bold tabular-nums text-slate-900">−{formatCoins(item.coins, displayLocale)}</span>
                    <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {open ? (
                    <ul className="space-y-1 bg-gray-50 px-4 py-2.5 text-[13px]">
                      {KIND_ORDER.filter((kind) => item.breakdown[kind]).map((kind) => (
                        <li key={kind} className="flex justify-between">
                          <span className="text-gray-600">{kindLabel(kind, copy)}</span>
                          <span className="tabular-nums text-slate-800">−{formatCoins(item.breakdown[kind] ?? 0, displayLocale)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {cursor ? (
          <button
            type="button"
            disabled={historyState === "more"}
            onClick={() => {
              setHistoryState("more");
              void loadHistory(cursor);
            }}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-200 text-[13px] font-semibold text-slate-700 transition active:bg-gray-50"
          >
            {historyState === "more" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : copy.loadMore}
          </button>
        ) : null}
      </section>
    </div>
  );
}
