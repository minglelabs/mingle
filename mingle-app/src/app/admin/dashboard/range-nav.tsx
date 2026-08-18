"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-metrics";
import { clearDashboardCacheAction } from "./actions";

export function RangeNav({
  options,
  activeDays,
}: {
  options: readonly AdminDashboardRange[];
  activeDays: AdminDashboardRange;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClearCacheAndRefresh = async () => {
    if (isPending || isRefreshing) return;
    setErrorMessage(null);
    setIsRefreshing(true);
    try {
      const result = await clearDashboardCacheAction();
      if (!result.success) {
        setErrorMessage(result.error ?? "캐시 초기화에 실패했습니다.");
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      console.error(err);
      setErrorMessage("오류가 발생했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const busy = isPending || isRefreshing;

  return (
    <div className="mx-auto mt-6 flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4">
      <nav className="flex items-center gap-2" aria-label="기간 선택">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={busy}
            aria-current={option === activeDays ? "true" : undefined}
            onClick={() => {
              if (option === activeDays) return;
              startTransition(() => {
                router.push(`/admin/dashboard?days=${option}`);
              });
            }}
            className={[
              "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
              option === activeDays
                ? "border-[#b45309] bg-[#f59e0b] text-white"
                : "border-[#e5e3dc] bg-white text-[#52514e] hover:bg-[#f4f3ee]",
            ].join(" ")}
          >
            최근 {option}일
          </button>
        ))}
        {busy ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#898781]">
            <span
              aria-hidden="true"
              className="h-3 w-3 animate-spin rounded-full border-2 border-[#e5e3dc] border-t-[#f59e0b]"
            />
            {isRefreshing ? "캐시 비우고 재계산 중..." : "불러오는 중..."}
          </span>
        ) : null}
        {errorMessage ? (
          <span className="text-xs text-red-600">{errorMessage}</span>
        ) : null}
      </nav>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={handleClearCacheAndRefresh}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#e5e3dc] bg-white px-3 text-xs font-semibold text-[#52514e] transition hover:bg-[#f4f3ee] disabled:cursor-not-allowed disabled:opacity-60"
          title="과거 캐시 데이터를 모두 비우고 전체 지표를 다시 계산합니다 (시간이 다소 소요될 수 있습니다)."
        >
          <svg
            className={["h-3.5 w-3.5 text-[#898781]", isRefreshing ? "animate-spin" : ""].join(" ")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          캐시 비우고 다시 계산
        </button>
      </div>
    </div>
  );
}
