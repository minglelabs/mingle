"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2, X } from "lucide-react";
import type { UserActivityMetric, UserActivityStats } from "@/server/admin/user-activity-stats";

/**
 * Staff-only "활동 통계" button on a profile, in Korean like the operator tool.
 * Shown when the signed-in app account is staff (admin notify target, e.g.
 * @royce) or the web view holds an admin session; `/admin/api/user-stats`
 * checks the same again and answers nobody else.
 */
export default function StaffUserStats({ userId }: { userId: string }) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/admin/api/app-viewer", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { admin?: boolean; staff?: boolean } | null) => setVisible(Boolean(body?.admin || body?.staff)))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!visible) return null;
  return (
    <>
      <button
        type="button"
        data-testid="staff-user-stats"
        onClick={() => setOpen(true)}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-[13px] font-semibold text-gray-600 transition active:bg-gray-100"
      >
        <BarChart3 size={16} strokeWidth={2} aria-hidden="true" />
        활동 통계 (운영진)
      </button>
      {open ? <StatsSheet userId={userId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const KST = "Asia/Seoul";

function formatDate(iso: string | null, withYear = false): string {
  if (!iso) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: KST, year: "2-digit", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return withYear ? `${get("year")}.${get("month")}.${get("day")}` : `${get("month")}.${get("day")}`;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분`;
  return `${total}초`;
}

export function formatMetricValue(metric: Pick<UserActivityMetric, "unit">, value: number): string {
  if (metric.unit === "seconds") return value ? formatDuration(value) : "0";
  if (metric.unit === "hash") return value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  return value.toLocaleString("ko-KR");
}

function StatsSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [stats, setStats] = useState<UserActivityStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/admin/api/user-stats?userId=${encodeURIComponent(userId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { stats: UserActivityStats }) => setStats(body.stats))
      .catch((reason: unknown) => { if (!controller.signal.aborted) { console.warn("[staff-user-stats] load_failed", reason); setError(true); } });
    return () => controller.abort();
  }, [userId]);

  const groups = stats
    ? [...new Set(stats.metrics.map((metric) => metric.group))].map((group) => ({ group, metrics: stats.metrics.filter((metric) => metric.group === group) }))
    : [];

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="활동 통계">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-bold text-slate-900">활동 통계</h2>
          <p className="text-[12px] text-gray-500">운영진만 볼 수 있어요 · 기존 기록 집계 · 날짜는 한국 시간</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-500 active:bg-gray-100" aria-label="닫기">
          <X size={20} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),24px)]">
        {error ? <p className="mt-10 text-center text-[14px] text-red-500">통계를 불러오지 못했어요.</p> : null}
        {!stats && !error ? (
          <div className="mt-16 flex justify-center text-gray-400"><Loader2 className="animate-spin" size={24} aria-hidden="true" /></div>
        ) : null}
        {stats ? (
          <>
            <section className="mt-4 rounded-xl bg-gray-50 p-3 text-[13px] text-slate-700">
              <p className="text-[15px] font-semibold text-slate-900">
                {stats.user.name ?? "(이름 없음)"} <span className="font-normal text-gray-500">@{stats.user.handle}</span>
                {stats.user.isOperator ? <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">운영 계정</span> : null}
              </p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-gray-500">가입</dt><dd>{formatDateTime(stats.user.createdAt)}</dd>
                <dt className="text-gray-500">마지막 접속</dt><dd>{formatDateTime(stats.user.lastSeenAt)}</dd>
                <dt className="text-gray-500">기기·버전</dt><dd>{[stats.user.platform, stats.user.appVersion].filter(Boolean).join(" · ") || "-"}</dd>
                <dt className="text-gray-500">가입 경로</dt><dd>{[stats.user.discoverySource, stats.user.referralSource].filter(Boolean).join(" · ") || "-"}</dd>
                <dt className="text-gray-500">사용 목적</dt><dd>{stats.user.usagePurpose ?? "-"}</dd>
                <dt className="text-gray-500">국적·언어</dt><dd>{[stats.user.nationalityCountry, stats.user.primaryLanguages.join("/"), stats.user.interestLanguages.length ? `배우는 중 ${stats.user.interestLanguages.join("/")}` : null].filter(Boolean).join(" · ") || "-"}</dd>
                <dt className="text-gray-500">앱 사용 시간</dt><dd>{formatDuration(stats.user.totalUsageSec)}</dd>
                <dt className="text-gray-500">해씨 잔액</dt><dd>{stats.user.hashBalance === null ? "-" : formatMetricValue({ unit: "hash" }, stats.user.hashBalance)}</dd>
              </dl>
            </section>

            {groups.map(({ group, metrics }) => (
              <section key={group} className="mt-5">
                <h3 className="mb-1.5 text-[14px] font-bold text-slate-900">{group}</h3>
                <table className="w-full table-fixed text-[13px]">
                  <thead>
                    <tr className="text-[11px] text-gray-400">
                      <th className="w-[38%] pb-1 text-left font-medium">항목</th>
                      <th className="pb-1 text-right font-medium">전체</th>
                      <th className="pb-1 text-right font-medium">30일</th>
                      <th className="pb-1 text-right font-medium">7일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map((metric) => (
                      <tr key={metric.key} className={`border-t border-gray-100 align-top ${metric.total ? "" : "text-gray-300"}`}>
                        <td className="py-1.5 pr-1">
                          <div className="font-medium">{metric.label}</div>
                          {metric.first ? <div className="text-[11px] text-gray-400">{formatDate(metric.first, true)} ~ {formatDate(metric.last)}</div> : null}
                        </td>
                        <td className="py-1.5 text-right font-semibold tabular-nums">{formatMetricValue(metric, metric.total)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatMetricValue(metric, metric.last30)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatMetricValue(metric, metric.last7)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}

            <section className="mt-5">
              <h3 className="mb-1.5 text-[14px] font-bold text-slate-900">대화 상대</h3>
              <p className="text-[13px] text-slate-700">
                다른 사람이 말한 대화방 <b>{stats.conversations.roomsWithOthers}</b>개 · 대화 상대 <b>{stats.conversations.partners}</b>명
              </p>
              <ul className="mt-2 divide-y divide-gray-100 text-[13px]">
                {stats.conversations.topPartners.map((partner) => (
                  <li key={partner.userId} className="flex items-center justify-between py-1.5">
                    <span className="min-w-0 truncate">
                      {partner.name ?? "(이름 없음)"} <span className="text-gray-400">@{partner.handle}</span>
                      {partner.isOperator ? <span className="ml-1 text-[11px] text-indigo-600">운영</span> : null}
                    </span>
                    <span className="shrink-0 pl-2 tabular-nums text-gray-600">{partner.messages.toLocaleString("ko-KR")}개 · {formatDate(partner.last)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
