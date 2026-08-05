"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-metrics";

export function RangeNav({
  options,
  activeDays,
}: {
  options: readonly AdminDashboardRange[];
  activeDays: AdminDashboardRange;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <nav className="mx-auto mt-3 flex w-full max-w-6xl items-center gap-2 px-4" aria-label="기간 선택">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={isPending}
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
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
          ].join(" ")}
        >
          최근 {option}일
        </button>
      ))}
      {isPending ? (
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-950"
          />
          불러오는 중...
        </span>
      ) : null}
    </nav>
  );
}
