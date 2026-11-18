import { METRIC_LABEL, type SocialMetrics, type TargetStatus } from "@/server/marketing-social/types";
import type { AdminChipTone } from "../../_components/ui";

export const STATUS_TONE: Record<TargetStatus, AdminChipTone> = {
  queued: "neutral",
  processing: "accent",
  published: "success",
  failed: "danger",
};

/** 1234 → "1,234", 15300 → "1.5만". */
export function formatCount(value: number): string {
  if (value >= 10_000) return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}만`;
  return value.toLocaleString("ko-KR");
}

/** "조회 1,234 · 좋아요 56" for the metrics a platform gave, in a fixed order. */
export function formatMetrics(metrics: SocialMetrics | null): string {
  if (!metrics) return "";
  return (Object.keys(METRIC_LABEL) as (keyof SocialMetrics)[])
    .filter((key) => typeof metrics[key] === "number")
    .map((key) => `${METRIC_LABEL[key]} ${formatCount(metrics[key] as number)}`)
    .join(" · ");
}

export function formatKst(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Upload / create errors from the admin API, in Korean. */
export const SOCIAL_ERROR_COPY: Record<string, string> = {
  not_mp4: "mp4 영상만 올릴 수 있습니다.",
  video_too_large: "영상이 너무 큽니다 (최대 200MB).",
  video_too_long: "영상이 너무 깁니다 (최대 90초).",
  cover_too_large: "커버 이미지가 너무 큽니다 (최대 8MB).",
  cover_not_image: "커버는 JPG 또는 PNG만 됩니다.",
  storage_not_configured: "파일 저장소(R2) 설정이 없습니다.",
  storage_failed: "파일 저장에 실패했습니다. 다시 시도해 주세요.",
  title_required: "제목을 입력하세요.",
  title_too_long: "제목은 100자까지입니다.",
  video_required: "영상을 먼저 올리세요.",
  cover_invalid: "커버 이미지를 다시 올리세요.",
  no_platforms: "올릴 플랫폼을 하나 이상 고르세요.",
  platform_not_connected: "연결되지 않은 플랫폼이 있습니다.",
  caption_too_long: "캡션이 너무 깁니다.",
};
