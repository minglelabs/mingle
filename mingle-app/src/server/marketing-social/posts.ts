import type { MarketingVideo, MarketingVideoTarget, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { connectedPlatforms } from './accounts'
import { captionTooLong, normalizeHashtags } from './captions'
import { isMarketingMediaUrl, objectKeyFromMarketingUrl } from './media'
import {
  isSocialPlatform,
  SOCIAL_PLATFORMS,
  YOUTUBE_TITLE_LIMIT,
  type SocialMetrics,
  type SocialPlatform,
  type SocialVideoView,
  type TargetOptions,
  type TargetStatus,
} from './types'

export type CreateVideoInput = {
  title?: unknown
  videoUrl?: unknown
  videoBytes?: unknown
  durationMs?: unknown
  width?: unknown
  height?: unknown
  coverUrl?: unknown
  hashtags?: unknown
  targets?: unknown
}

export type CreateVideoResult =
  | { ok: true; videoId: string }
  | { ok: false; error: string; platform?: SocialPlatform }

function intOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null
}

const TIKTOK_PRIVACY = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']
const YOUTUBE_PRIVACY = ['public', 'unlisted', 'private']

function readOptions(platform: SocialPlatform, raw: unknown): TargetOptions | null {
  const privacy = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).privacy : undefined
  if (typeof privacy !== 'string') return null
  if (platform === 'tiktok' && TIKTOK_PRIVACY.includes(privacy)) return { privacy }
  if (platform === 'youtube' && YOUTUBE_PRIVACY.includes(privacy)) return { privacy }
  return null
}

/** Validate and queue one video for the chosen, connected platforms. */
export async function createMarketingVideo(input: CreateVideoInput): Promise<CreateVideoResult> {
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) return { ok: false, error: 'title_required' }
  if (title.length > YOUTUBE_TITLE_LIMIT) return { ok: false, error: 'title_too_long' }
  if (!isMarketingMediaUrl(input.videoUrl)) return { ok: false, error: 'video_required' }
  const coverUrl = input.coverUrl === null || input.coverUrl === undefined || input.coverUrl === '' ? null : input.coverUrl
  if (coverUrl !== null && !isMarketingMediaUrl(coverUrl)) return { ok: false, error: 'cover_invalid' }
  const videoBytes = intOrNull(input.videoBytes)
  if (!videoBytes) return { ok: false, error: 'video_required' }

  const rawTargets = Array.isArray(input.targets) ? input.targets : []
  const targets: { platform: SocialPlatform; caption: string; options: TargetOptions | null }[] = []
  for (const raw of rawTargets) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    if (!isSocialPlatform(record.platform) || targets.some((t) => t.platform === record.platform)) continue
    const caption = typeof record.caption === 'string' ? record.caption.trim() : ''
    if (captionTooLong(record.platform, caption)) return { ok: false, error: 'caption_too_long', platform: record.platform }
    targets.push({ platform: record.platform, caption, options: readOptions(record.platform, record.options) })
  }
  if (targets.length === 0) return { ok: false, error: 'no_platforms' }
  const linked = await connectedPlatforms()
  const missing = targets.find((t) => !linked.includes(t.platform))
  if (missing) return { ok: false, error: 'platform_not_connected', platform: missing.platform }

  const video = await prisma.marketingVideo.create({
    data: {
      title,
      videoUrl: input.videoUrl,
      videoObjectKey: objectKeyFromMarketingUrl(input.videoUrl),
      videoBytes,
      durationMs: intOrNull(input.durationMs),
      width: intOrNull(input.width),
      height: intOrNull(input.height),
      coverUrl,
      coverObjectKey: coverUrl ? objectKeyFromMarketingUrl(coverUrl) : null,
      hashtags: normalizeHashtags(input.hashtags),
      targets: {
        create: targets.map((t) => ({
          platform: t.platform,
          caption: t.caption,
          ...(t.options ? { options: t.options as Prisma.InputJsonValue } : {}),
        })),
      },
    },
  })
  return { ok: true, videoId: video.id }
}

/** Put a failed target back in the queue (starts the upload over). */
export async function retryTarget(videoId: string, targetId: string): Promise<'ok' | 'not_found' | 'not_failed'> {
  const target = await prisma.marketingVideoTarget.findFirst({ where: { id: targetId, videoId } })
  if (!target) return 'not_found'
  if (target.status !== 'failed') return 'not_failed'
  await prisma.marketingVideoTarget.update({
    where: { id: target.id },
    data: { status: 'queued', error: null, containerId: null, startedAt: null, attempts: 0, nextAttemptAt: new Date() },
  })
  return 'ok'
}

type VideoWithTargets = MarketingVideo & { targets: MarketingVideoTarget[] }

function targetOrder(platform: string): number {
  const index = (SOCIAL_PLATFORMS as readonly string[]).indexOf(platform)
  return index < 0 ? 99 : index
}

export function toVideoView(video: VideoWithTargets): SocialVideoView {
  return {
    id: video.id,
    title: video.title,
    videoUrl: video.videoUrl,
    coverUrl: video.coverUrl,
    durationMs: video.durationMs,
    width: video.width,
    height: video.height,
    hashtags: video.hashtags,
    createdAt: video.createdAt.toISOString(),
    targets: [...video.targets]
      .sort((a, b) => targetOrder(a.platform) - targetOrder(b.platform))
      .map((t) => ({
        id: t.id,
        platform: t.platform as SocialPlatform,
        caption: t.caption,
        options: (t.options as TargetOptions | null) ?? null,
        status: t.status as TargetStatus,
        permalink: t.permalink,
        error: t.error,
        attempts: t.attempts,
        publishedAt: t.publishedAt?.toISOString() ?? null,
        metrics: (t.metrics as SocialMetrics | null) ?? null,
        metricsFetchedAt: t.metricsFetchedAt?.toISOString() ?? null,
        metricsError: t.metricsError,
      })),
  }
}

export async function listMarketingVideos(limit = 30): Promise<SocialVideoView[]> {
  const rows = await prisma.marketingVideo.findMany({ orderBy: { createdAt: 'desc' }, take: limit, include: { targets: true } })
  return rows.map(toVideoView)
}

export async function getMarketingVideo(videoId: string): Promise<SocialVideoView | null> {
  const row = await prisma.marketingVideo.findUnique({ where: { id: videoId }, include: { targets: true } })
  return row ? toVideoView(row) : null
}
