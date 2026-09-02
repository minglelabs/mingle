"use client";

import { useMemo, useState } from "react";
import {
  type DashboardMetric,
  formatMetricDisplayValue,
} from "@/lib/admin-dashboard-metrics";

type SortOrder = "desc" | "asc";

export function MetricsTable({ metrics }: { metrics: DashboardMetric[] }) {
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
        kind: metric.kind,
        value: metric.points[index]?.value ?? null,
      })),
    }));
  }, [metrics, order]);

  const toggleOrder = () => {
    setOrder((prev) => (prev === "desc" ? "asc" : "desc"));
  };

  return (
    <div className="rounded-xl border border-[#e5e3dc] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#e5e3dc] px-4 py-2.5">
        <span className="text-xs font-medium text-[#898781]">
          총 {rowData.length}일 데이터 ({order === "desc" ? "최신순" : "오래된순"})
        </span>
        <button
          type="button"
          onClick={toggleOrder}
          className="inline-flex h-7 items-center justify-center gap-1.5 rounded border border-[#e5e3dc] bg-white px-2.5 text-xs font-semibold text-[#52514e] transition hover:bg-[#f4f3ee]"
          title="날짜 정렬 순서를 바꿉니다."
        >
          <svg
            className="h-3.5 w-3.5 text-[#898781]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {order === "desc" ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
            )}
          </svg>
          {order === "desc" ? "오래된순으로 보기" : "최신순으로 보기"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#e5e3dc] bg-[#f4f3ee] text-xs font-semibold uppercase tracking-wide text-[#898781]">
              <th className="px-3 py-2">
                <button
                  type="button"
                  onClick={toggleOrder}
                  className="inline-flex items-center gap-1 font-semibold text-[#898781] hover:text-[#0b0b0b]"
                >
                  날짜 {order === "desc" ? "↓" : "↑"}
                </button>
              </th>
              {metrics.map((metric) => (
                <th className="px-3 py-2" key={metric.key}>
                  {metric.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowData.map((row) => (
              <tr className="border-b border-[#ece9e0] last:border-0" key={row.day}>
                <td className="px-3 py-1.5 font-medium text-[#0b0b0b]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.day}
                </td>
                {row.values.map((col) => (
                  <td
                    className="px-3 py-1.5 text-[#52514e]"
                    key={col.key}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatMetricDisplayValue(col.value, col.kind)}
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
