"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { OPERATOR_POST_STAT_KEYS, type OperatorPostStatKey } from "@/lib/operator-post-stats";
import { cn } from "@/lib/utils";
import type { OperatorPostStatsListRow } from "@/server/operator-post-stats/load";
import { OPERATOR_POST_STAT_LABELS, OperatorPostStatValue } from "../_components/operator-post-stats-row";

type SortOrder = "desc" | "asc";

const DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** By one count; equal counts keep the newer post first in either order. */
export function sortOperatorPostRows(
  rows: readonly OperatorPostStatsListRow[],
  key: OperatorPostStatKey,
  order: SortOrder,
): OperatorPostStatsListRow[] {
  const direction = order === "desc" ? 1 : -1;
  return [...rows].sort((left, right) =>
    direction * (right.stats[key] - left.stats[key])
    || Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}

function chipClassName(active: boolean): string {
  return cn(
    "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition",
    active ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  );
}

function PostCell({ row }: { row: OperatorPostStatsListRow }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-slate-500">
        <Link href={`/admin/operators/${encodeURIComponent(row.authorId)}`} className="font-semibold text-sky-700">
          {row.authorName || `@${row.authorHandle}`}
        </Link>
        {` · ${DATE_FORMAT.format(new Date(row.publishedAt))}`}
        {row.photoCount ? ` · 사진 ${row.photoCount}장` : ""}
      </p>
      <Link href={`/admin/activity/posts/${encodeURIComponent(row.postId)}`} className="mt-0.5 line-clamp-2 break-words text-sm text-slate-800">
        {row.snippet || "(사진만 있는 글)"}
      </Link>
    </div>
  );
}

/**
 * Operator posts of the dashboard range with their stats, most viewed first.
 * Sorting runs in the browser over the rows the server sent. Below `sm` each
 * post is a card with a label/value grid; from `sm` up it is a table.
 */
export function OperatorPostStatsTable({ rows }: { rows: OperatorPostStatsListRow[] }) {
  const [sortKey, setSortKey] = useState<OperatorPostStatKey>("views");
  const [order, setOrder] = useState<SortOrder>("desc");
  const sorted = useMemo(() => sortOperatorPostRows(rows, sortKey, order), [rows, sortKey, order]);
  const SortIcon = order === "desc" ? ArrowDownWideNarrow : ArrowUpNarrowWide;

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500 shadow-sm">
        이 기간에 올라간 운영 계정 글이 없습니다.
      </p>
    );
  }

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2">
        <span className="text-xs font-medium text-slate-500">정렬</span>
        <nav aria-label="정렬 기준" className="flex flex-wrap gap-2">
          {OPERATOR_POST_STAT_KEYS.map((key) => (
            <button key={key} type="button" className={chipClassName(key === sortKey)} aria-pressed={key === sortKey} onClick={() => setSortKey(key)}>
              {OPERATOR_POST_STAT_LABELS[key]}
            </button>
          ))}
        </nav>
        <button
          className="ml-auto inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={() => setOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
          type="button"
        >
          <SortIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />
          {order === "desc" ? "많은 순" : "적은 순"}
        </button>
      </div>

      <ul className="divide-y divide-slate-100 sm:hidden">
        {sorted.map((row) => (
          <li className="px-4 py-3" key={row.postId}>
            <PostCell row={row} />
            <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2">
              {OPERATOR_POST_STAT_KEYS.map((key) => (
                <div className="min-w-0" key={key}>
                  <dt className="break-words text-xs text-slate-500">{OPERATOR_POST_STAT_LABELS[key]}</dt>
                  <dd className="break-words text-sm font-medium tabular-nums text-slate-800">
                    <OperatorPostStatValue stats={row.stats} statKey={key} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
              <th className="px-3 py-2" scope="col">글</th>
              {OPERATOR_POST_STAT_KEYS.map((key) => (
                <th className="whitespace-nowrap px-3 py-2 text-right" key={key} scope="col">
                  {OPERATOR_POST_STAT_LABELS[key]}{key === sortKey ? (order === "desc" ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr className="border-b border-slate-100 align-top last:border-0" key={row.postId}>
                <td className="max-w-[22rem] px-3 py-2"><PostCell row={row} /></td>
                {OPERATOR_POST_STAT_KEYS.map((key) => (
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700" key={key}>
                    <OperatorPostStatValue stats={row.stats} statKey={key} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
