/**
 * Marketing video cross-posting (/admin/social): one video uploaded once,
 * posted to Instagram Reels, Threads, YouTube Shorts and TikTok.
 * Shared by server modules and admin client components (no server imports).
 */
export const SOCIAL_PLATFORMS = ['instagram', 'threads', 'youtube', 'tiktok'] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(value)
}

export const SOCIAL_PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: '인스타그램 릴스',
  threads: '쓰레드',
  youtube: '유튜브 쇼츠',
  tiktok: '틱톡',
}

/** Longest caption each platform accepts (YouTube: description; its title is the video title). */
export const SOCIAL_CAPTION_LIMIT: Record<SocialPlatform, number> = {
  instagram: 2200,
  threads: 500,
  youtube: 5000,
  tiktok: 2200,
}

export const YOUTUBE_TITLE_LIMIT = 100

export const TARGET_STATUSES = ['queued', 'processing', 'published', 'failed'] as const
export type TargetStatus = (typeof TARGET_STATUSES)[number]

export const TARGET_STATUS_LABEL: Record<TargetStatus, string> = {
  queued: '대기',
  processing: '처리 중',
  published: '게시됨',
  failed: '실패',
}

/** What a platform API gives back, normalized; absent keys mean the platform does not report it. */
export type SocialMetrics = Partial<Record<'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'reach', number>>

export const METRIC_LABEL: Record<keyof SocialMetrics, string> = {
  views: '조회',
  likes: '좋아요',
  comments: '댓글',
  shares: '공유',
  saves: '저장',
  reach: '도달',
}

export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'
export type YouTubePrivacy = 'public' | 'unlisted' | 'private'

export type TargetOptions = { privacy?: string }

/** Video limits checked on upload (all four platforms accept this). */
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024
export const VIDEO_MAX_DURATION_MS = 90_000
export const COVER_MAX_BYTES = 8 * 1024 * 1024

export type SocialAccountView = {
  platform: SocialPlatform
  configured: boolean
  connected: boolean
  username: string | null
  displayName: string | null
  connectedAt: string | null
  accessTokenExpiresAt: string | null
  refreshTokenExpiresAt: string | null
  lastError: string | null
}

export type SocialTargetView = {
  id: string
  platform: SocialPlatform
  caption: string
  options: TargetOptions | null
  status: TargetStatus
  permalink: string | null
  error: string | null
  attempts: number
  publishedAt: string | null
  metrics: SocialMetrics | null
  metricsFetchedAt: string | null
  metricsError: string | null
}

export type SocialVideoView = {
  id: string
  title: string
  videoUrl: string
  coverUrl: string | null
  durationMs: number | null
  width: number | null
  height: number | null
  hashtags: string[]
  createdAt: string
  targets: SocialTargetView[]
}
