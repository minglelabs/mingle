"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ADMIN_DASHBOARD_MAX_DAYS,
  type AdminDashboardRange,
} from "@/lib/admin-dashboard-metrics";
import { clearDashboardCacheAction } from "./actions";

export function RangeNav({
  presetOptions,
  activeDays,
}: {
  presetOptions: readonly AdminDashboardRange[];
  activeDays: AdminDashboardRange;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Custom 입력 필드 상태
  const isCustomActive = !presetOptions.includes(activeDays);
  const [customInput, setCustomInput] = useState(isCustomActive ? String(activeDays) : "");
  const [customError, setCustomError] = useState<string | null>(null);

  const handleClearCacheAndRefresh = async () => {
    if (isPending || isRefreshing) return;
    setErrorMessage(null);
    setIsRefreshing(true);
    try {
      const result = await clearDashboardCacheAction(activeDays);
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

  const handlePresetClick = (option: AdminDashboardRange) => {
    if (option === activeDays) return;
    setCustomInput("");
    setCustomError(null);
    startTransition(() => {
      router.push(`/admin/dashboard?days=${option}`);
    });
  };

  const handleCustomApply = () => {
    const parsed = Math.round(Number(customInput));
    if (!Number.isFinite(parsed) || parsed < 1) {
      setCustomError("1 이상의 숫자를 입력해 주세요.");
      return;
    }
    if (parsed > ADMIN_DASHBOARD_MAX_DAYS) {
      setCustomError(`최대 ${ADMIN_DASHBOARD_MAX_DAYS}일까지 입력할 수 있습니다.`);
      return;
    }
    setCustomError(null);
    if (parsed === activeDays) return;
    startTransition(() => {
      router.push(`/admin/dashboard?days=${parsed}`);
    });
  };

  const busy = isPending || isRefreshing;

  return (
    <div className="mx-auto mt-6 flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex items-center gap-2" aria-label="기간 선택">
          {presetOptions.map((option) => (
            <button
              key={option}
              type="button"
              disabled={busy}
              aria-current={option === activeDays ? "true" : undefined}
              onClick={() => handlePresetClick(option)}
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
        </nav>

        {/* Custom 기간 입력 */}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={ADMIN_DASHBOARD_MAX_DAYS}
            value={customInput}
            disabled={busy}
            onChange={(e) => {
              setCustomInput(e.target.value);
              setCustomError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCustomApply();
            }}
            placeholder={`직접 입력 (1~${ADMIN_DASHBOARD_MAX_DAYS})`}
            aria-label="직접 기간 입력 (일 수)"
            className={[
              "h-9 w-40 rounded-md border px-3 text-sm text-[#0b0b0b] placeholder-[#b8b5ae] outline-none transition focus:border-[#f59e0b] focus:ring-1 focus:ring-[#f59e0b] disabled:cursor-not-allowed disabled:opacity-60",
              isCustomActive
                ? "border-[#b45309] bg-[#fff8ed]"
                : "border-[#e5e3dc] bg-white",
            ].join(" ")}
          />
          <button
            type="button"
            disabled={busy || customInput === ""}
            onClick={handleCustomApply}
            className="inline-flex h-9 items-center justify-center rounded-md border border-[#e5e3dc] bg-white px-3 text-sm font-semibold text-[#52514e] transition hover:bg-[#f4f3ee] disabled:cursor-not-allowed disabled:opacity-60"
          >
            적용
          </button>
        </div>

        {customError ? (
          <span className="text-xs text-red-600">{customError}</span>
        ) : null}

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
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={handleClearCacheAndRefresh}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#e5e3dc] bg-white px-3 text-xs font-semibold text-[#52514e] transition hover:bg-[#f4f3ee] disabled:cursor-not-allowed disabled:opacity-60"
          title={`현재 ${activeDays}일 기간의 캐시를 비우고 재계산합니다 (오늘·어제 제외, 시간이 다소 소요될 수 있습니다).`}
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
