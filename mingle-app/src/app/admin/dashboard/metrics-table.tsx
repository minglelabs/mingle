"use client";

import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import {
  type DashboardMetric,
  type MetricKind,
  formatMetricDisplayValue,
} from "@/lib/admin-dashboard-metrics";
import type { UsageDayStatus } from "@/lib/admin-dashboard-usage";
import { DashboardSpinner } from "./dashboard-spinner";

type SortOrder = "desc" | "asc";

function MetricCellValue({ value, kind, status }: { value: number | null; kind: MetricKind; status: UsageDayStatus }) {
  if (status === "pending") {
    return (
      <span className="inline-flex h-5 items-center">
        <DashboardSpinner />
        <span className="sr-only">계산 중</span>
      </span>
    );
  }
  if (status === "failed") return <span className="text-xs font-medium text-rose-600">오류</span>;
  return <>{formatMetricDisplayValue(value, kind)}</>;
}

/**
 * Daily values of every metric. Below `sm` each day is a card with a
 * label/value grid (no sideways scroll at 375 px); from `sm` up it is a table.
 * `dayStatus` (by metric key, in point order) marks the cells still being
 * computed, which show a spinner, and those that failed to load. `pendingText`
 * replaces the "N일 계산 중" status, for before it is known which days that is.
 */
export function MetricsTable({
  metrics,
  dayStatus,
  pendingText,
}: {
  metrics: DashboardMetric[];
  dayStatus?: Readonly<Record<string, readonly UsageDayStatus[]>>;
  pendingText?: string;
}) {
  const [order, setOrder] = useState<SortOrder>("desc");

  const rowData = useMemo(() => {
    const rawDays = metrics[0]?.points.map((point) => point.day) ?? [];
    const indices = rawDays.map((_, i) => i);
    if (order === "desc") {
      indices.reverse();
    }
    return indices.map((index) => ({
      day: rawDays[index],
      values: metrics.map((metric) => ({
        key: metric.key,
        label: metric.label,
        kind: metric.kind,
        value: metric.points[index]?.value ?? null,
        status: dayStatus?.[metric.key]?.[index] ?? "ready",
      })),
    }));
  }, [metrics, dayStatus, order]);

  const pendingDays = rowData.filter((row) => row.values.some((col) => col.status === "pending")).length;
  const hasFailure = rowData.some((row) => row.values.some((col) => col.status === "failed"));

  const toggleOrder = () => {
    setOrder((prev) => (prev === "desc" ? "asc" : "desc"));
  };
  const SortIcon = order === "desc" ? ArrowDownWideNarrow : ArrowUpNarrowWide;

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs font-medium text-slate-500">
            {rowData.length}일 · {order === "desc" ? "최신순" : "오래된순"}
          </span>
          {pendingDays > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500" role="status">
              <DashboardSpinner />
              {pendingText ?? `${pendingDays}일 계산 중`}
            </span>
          ) : null}
          {hasFailure ? (
            <span className="text-xs font-medium text-rose-600" role="alert">일부 값을 불러오지 못했습니다</span>
          ) : null}
        </div>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={toggleOrder}
          type="button"
        >
          <SortIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />
          {order === "desc" ? "오래된순으로 보기" : "최신순으로 보기"}
        </button>
      </div>

      <ul className="divide-y divide-slate-100 sm:hidden">
        {rowData.map((row) => (
          <li className="px-4 py-3" key={row.day}>
            <p className="text-sm font-semibold tabular-nums text-slate-900">{row.day}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
              {row.values.map((col) => (
                <div className="min-w-0" key={col.key}>
                  <dt className="break-words text-xs text-slate-500">{col.label}</dt>
                  <dd className="break-words text-sm font-medium tabular-nums text-slate-800">
                    <MetricCellValue value={col.value} kind={col.kind} status={col.status} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
              <th className="px-3 py-2" scope="col">
                <button
                  className="inline-flex min-h-11 items-center gap-1 font-semibold text-slate-500 hover:text-slate-900"
                  onClick={toggleOrder}
                  type="button"
                >
                  날짜 {order === "desc" ? "↓" : "↑"}
                </button>
              </th>
              {metrics.map((metric) => (
                <th className="px-3 py-2" key={metric.key} scope="col">
                  {metric.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowData.map((row) => (
              <tr className="border-b border-slate-100 last:border-0" key={row.day}>
                <td className="px-3 py-1.5 font-medium tabular-nums text-slate-900">
                  {row.day}
                </td>
                {row.values.map((col) => (
                  <td className="px-3 py-1.5 tabular-nums text-slate-600" key={col.key}>
                    <MetricCellValue value={col.value} kind={col.kind} status={col.status} />
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
