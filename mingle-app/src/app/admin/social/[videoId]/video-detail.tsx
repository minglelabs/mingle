"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import {
  METRIC_LABEL,
  SOCIAL_PLATFORM_LABEL,
  TARGET_STATUS_LABEL,
  type SocialMetrics,
  type SocialVideoView,
} from "@/server/marketing-social/types";
import { AdminButton, AdminCard, AdminChip, AdminNotice } from "../../_components/ui";
import { formatCount, formatKst, STATUS_TONE } from "../_components/format";

const POLL_MS = 5_000;

export function VideoDetail({ initial }: { initial: SocialVideoView }) {
  const [video, setVideo] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = video.targets.some((t) => t.status === "queued" || t.status === "processing");

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/admin/social/api/videos/${video.id}`, { cache: "no-store" });
        if (response.ok) setVideo(((await response.json()) as { video: SocialVideoView }).video);
      } catch {
        // next poll
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, video.id]);

  async function retry(targetId: string) {
    setBusy(targetId);
    setError(null);
    try {
      const response = await fetch(`/admin/social/api/videos/${video.id}/targets/${targetId}/retry`, { method: "POST" });
      if (!response.ok) throw new Error();
      setVideo((v) => ({ ...v, targets: v.targets.map((t) => (t.id === targetId ? { ...t, status: "queued", error: null } : t)) }));
    } catch {
      setError("재시도 요청에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function refreshMetrics() {
    setBusy("metrics");
    setError(null);
    try {
      const response = await fetch(`/admin/social/api/videos/${video.id}/metrics`, { method: "POST" });
      if (!response.ok) throw new Error();
      setVideo(((await response.json()) as { video: SocialVideoView }).video);
    } catch {
      setError("지표를 가져오지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <AdminCard className="flex gap-3">
        <video className="h-40 w-[90px] shrink-0 rounded-lg bg-black object-cover" controls muted playsInline poster={video.coverUrl ?? undefined} src={video.videoUrl} />
        <div className="min-w-0 text-sm text-slate-600">
          <p>{formatKst(video.createdAt)} 등록</p>
          {video.durationMs ? <p>{(video.durationMs / 1000).toFixed(1)}초{video.width && video.height ? ` · ${video.width}×${video.height}` : ""}</p> : null}
          {video.hashtags.length ? <p className="mt-1 break-words">{video.hashtags.join(" ")}</p> : null}
        </div>
      </AdminCard>

      {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}

      {video.targets.map((target) => (
        <AdminCard key={target.id}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-slate-900">{SOCIAL_PLATFORM_LABEL[target.platform]}</p>
            <AdminChip tone={STATUS_TONE[target.status]}>{TARGET_STATUS_LABEL[target.status]}</AdminChip>
          </div>
          {target.publishedAt ? <p className="mt-1 text-sm text-slate-500">{formatKst(target.publishedAt)} 게시</p> : null}
          {target.error ? (
            <p className={`mt-2 break-words text-sm ${target.status === "failed" ? "text-rose-700" : "text-amber-700"}`}>{target.error}</p>
          ) : null}

          {target.metrics && Object.keys(target.metrics).length ? (
            <dl className="mt-3 grid grid-cols-3 gap-2">
              {(Object.keys(METRIC_LABEL) as (keyof SocialMetrics)[])
                .filter((key) => typeof target.metrics?.[key] === "number")
                .map((key) => (
                  <div key={key} className="rounded-lg bg-slate-50 px-2 py-1.5 text-center">
                    <dt className="text-xs text-slate-500">{METRIC_LABEL[key]}</dt>
                    <dd className="font-semibold text-slate-900">{formatCount(target.metrics![key] as number)}</dd>
                  </div>
                ))}
            </dl>
          ) : null}
          {target.status === "published" ? (
            <p className="mt-2 text-xs text-slate-500">
              {target.metricsFetchedAt ? `지표 ${formatKst(target.metricsFetchedAt)} 기준` : "지표는 게시 10분 뒤부터 자동으로 가져옵니다."}
              {target.metricsError ? ` · 지표 오류: ${target.metricsError}` : ""}
              {target.platform === "tiktok" && !target.permalink ? " · 나만 보기 게시물은 링크·지표가 없습니다." : ""}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {target.permalink ? (
              <a className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-sky-700 hover:bg-sky-50" href={target.permalink} rel="noreferrer" target="_blank">
                게시물 열기
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
            {target.status === "failed" ? (
              <AdminButton disabled={busy === target.id} onClick={() => void retry(target.id)} variant="secondary">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                다시 시도
              </AdminButton>
            ) : null}
          </div>
          <details className="mt-2 text-sm text-slate-600">
            <summary className="min-h-11 cursor-pointer py-2.5 text-slate-500">캡션 보기</summary>
            <p className="whitespace-pre-wrap break-words">{target.caption}</p>
          </details>
        </AdminCard>
      ))}

      {video.targets.some((t) => t.status === "published") ? (
        <AdminButton block disabled={busy === "metrics"} onClick={() => void refreshMetrics()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          지표 지금 새로고침
        </AdminButton>
      ) : null}
    </div>
  );
}
