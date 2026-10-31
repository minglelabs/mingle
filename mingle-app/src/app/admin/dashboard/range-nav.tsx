"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import {
  ADMIN_DASHBOARD_PLATFORM_OPTIONS,
  ADMIN_DASHBOARD_MAX_DAYS,
  buildAdminDashboardHref,
  dashboardTabUsesPlatform,
  type AdminDashboardPlatform,
  type AdminDashboardRange,
  type AdminDashboardTab,
} from "@/lib/admin-dashboard-metrics";
import { cn } from "@/lib/utils";
import { clearDashboardCacheAction } from "./actions";

function segmentClassName(active: boolean): string {
  return cn(
    "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
    active ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  );
}

export function RangeNav({
  presetOptions,
  activeTab,
  activeDays,
  activePlatform,
}: {
  presetOptions: readonly AdminDashboardRange[];
  activeTab: AdminDashboardTab;
  activeDays: AdminDashboardRange;
  activePlatform: AdminDashboardPlatform;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Custom 입력 필드 상태
  const isCustomActive = !presetOptions.includes(activeDays);
  const [customInput, setCustomInput] = useState(isCustomActive ? String(activeDays) : "");
  const [customError, setCustomError] = useState<string | null>(null);

  // The OS row only where the tab's queries take it. The cache is the daily metric
  // cache, which only the 사용량·성능 tab reads; every other tab is a live query.
  const showsPlatform = dashboardTabUsesPlatform(activeTab);
  const showsCacheRefresh = activeTab === "usage";
  const buildHref = (days: AdminDashboardRange, platform: AdminDashboardPlatform) =>
    buildAdminDashboardHref({ tab: activeTab, days, platform });

  const handleClearCacheAndRefresh = async () => {
    if (isPending || isRefreshing) return;
    setErrorMessage(null);
    setIsRefreshing(true);
    try {
      const result = await clearDashboardCacheAction(activeDays, activePlatform, activeTab);
      // No result: the session ended and the action redirected to the login page.
      if (!result) return;
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
      router.push(buildHref(option, activePlatform));
    });
  };

  const handlePlatformClick = (platform: AdminDashboardPlatform) => {
    if (platform === activePlatform) return;
    startTransition(() => {
      router.push(buildHref(activeDays, platform));
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
      router.push(buildHref(parsed, activePlatform));
    });
  };

  const busy = isPending || isRefreshing;
  const showsPlatformNote = showsPlatform && activePlatform !== "all";
  const hasStatus = Boolean(customError || errorMessage || busy || showsPlatformNote);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {showsPlatform ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10 shrink-0 text-sm font-semibold text-slate-600">OS</span>
          <nav aria-label="OS 선택" className="flex flex-wrap gap-2">
            {ADMIN_DASHBOARD_PLATFORM_OPTIONS.map((option) => (
              <button
                aria-pressed={option.value === activePlatform}
                className={segmentClassName(option.value === activePlatform)}
                disabled={busy}
                key={option.value}
                onClick={() => handlePlatformClick(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </nav>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-10 shrink-0 text-sm font-semibold text-slate-600">기간</span>
        <nav aria-label="기간 선택" className="flex flex-wrap gap-2">
          {presetOptions.map((option) => (
            <button
              aria-current={option === activeDays ? "true" : undefined}
              className={segmentClassName(option === activeDays)}
              disabled={busy}
              key={option}
              onClick={() => handlePresetClick(option)}
              type="button"
            >
              최근 {option}일
            </button>
          ))}
        </nav>
      </div>

      {/* Custom 기간 입력 */}
      <div className="flex gap-2">
        <input
          aria-label="직접 기간 입력 (일 수)"
          className={cn(
            "min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-56",
            isCustomActive ? "border-sky-500 bg-sky-50" : "border-slate-300 bg-white",
          )}
          disabled={busy}
          inputMode="numeric"
          max={ADMIN_DASHBOARD_MAX_DAYS}
          min={1}
          onChange={(e) => {
            setCustomInput(e.target.value);
            setCustomError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCustomApply();
          }}
          placeholder={`직접 입력 (1~${ADMIN_DASHBOARD_MAX_DAYS}일)`}
          type="number"
          value={customInput}
        />
        <button
          className={segmentClassName(false)}
          disabled={busy || customInput === ""}
          onClick={handleCustomApply}
          type="button"
        >
          적용
        </button>
      </div>

      {/* Rendered only with something in it: an empty last row would still add the card's row gap. */}
      {showsCacheRefresh || hasStatus ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 space-y-1 text-xs">
            {customError ? <p className="text-rose-600" role="alert">{customError}</p> : null}
            {errorMessage ? <p className="text-rose-600" role="alert">{errorMessage}</p> : null}
            {busy ? (
              <p className="flex items-center gap-1.5 font-medium text-slate-500" role="status">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600"
                />
                {isRefreshing ? "캐시 비우고 재계산 중..." : "불러오는 중..."}
              </p>
            ) : null}
            {showsPlatformNote ? <p className="text-slate-500">사용자별 최근 확인 OS 기준</p> : null}
          </div>
          {showsCacheRefresh ? (
            <button
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={handleClearCacheAndRefresh}
              type="button"
            >
              <RefreshCw className={cn("h-4 w-4 text-slate-500", isRefreshing && "animate-spin")} aria-hidden="true" />
              캐시 비우고 다시 계산
            </button>
          ) : null}
        </div>
      ) : null}
      {showsCacheRefresh ? (
        <p className="text-xs leading-5 text-slate-500">
          다시 계산은 현재 {activeDays}일 {activePlatform === "all" ? "전체" : activePlatform} 캐시를 지우고 새로 집계합니다. 오늘과 어제는 항상 새로 집계하며, 시간이 걸릴 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}
