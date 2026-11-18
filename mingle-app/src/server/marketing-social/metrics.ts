import type { ActiveAccount } from './accounts'
import { socialJson } from './http'
import { GRAPH_INSTAGRAM, GRAPH_THREADS, TIKTOK_API, YOUTUBE_API } from './oauth'
import type { SocialMetrics, SocialPlatform } from './types'

/**
 * Per-post metrics, only what each platform's API reports:
 * - Instagram: media insights views / reach / likes / comments / shares / saved
 * - Threads: views / likes / replies / reposts+quotes / shares
 * - YouTube: statistics viewCount / likeCount / commentCount
 * - TikTok: video/query view / like / comment / share counts (public posts only)
 */
export type MetricsResult = { metrics: SocialMetrics; permalink: string | null }

function num(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : undefined
}

type InsightRow = { name?: string; values?: { value?: unknown }[]; total_value?: { value?: unknown } }

export function readInsightValues(rows: InsightRow[] | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows ?? []) {
    const value = num(row.total_value?.value ?? row.values?.[0]?.value)
    if (row.name && value !== undefined) out[row.name] = value
  }
  return out
}

function compact(metrics: SocialMetrics): SocialMetrics {
  return Object.fromEntries(Object.entries(metrics).filter(([, v]) => v !== undefined)) as SocialMetrics
}

async function instagramMetrics(account: ActiveAccount, postId: string): Promise<MetricsResult> {
  const media = await socialJson<{ permalink?: string; like_count?: number; comments_count?: number }>(
    `${GRAPH_INSTAGRAM}/${postId}?${new URLSearchParams({ fields: 'permalink,like_count,comments_count', access_token: account.accessToken })}`,
  )
  let insights: Record<string, number> = {}
  try {
    const body = await socialJson<{ data?: InsightRow[] }>(
      `${GRAPH_INSTAGRAM}/${postId}/insights?${new URLSearchParams({ metric: 'views,reach,likes,comments,shares,saved', access_token: account.accessToken })}`,
    )
    insights = readInsightValues(body.data)
  } catch {
    // Insights need instagram_business_manage_insights; fall back to the public counts.
  }
  return {
    permalink: media.permalink ?? null,
    metrics: compact({
      views: insights.views,
      reach: insights.reach,
      likes: insights.likes ?? num(media.like_count),
      comments: insights.comments ?? num(media.comments_count),
      shares: insights.shares,
      saves: insights.saved,
    }),
  }
}

async function threadsMetrics(account: ActiveAccount, postId: string): Promise<MetricsResult> {
  const body = await socialJson<{ data?: InsightRow[] }>(
    `${GRAPH_THREADS}/${postId}/insights?${new URLSearchParams({ metric: 'views,likes,replies,reposts,quotes,shares', access_token: account.accessToken })}`,
  )
  const v = readInsightValues(body.data)
  let permalink: string | null = null
  try {
    const media = await socialJson<{ permalink?: string }>(
      `${GRAPH_THREADS}/${postId}?${new URLSearchParams({ fields: 'permalink', access_token: account.accessToken })}`,
    )
    permalink = media.permalink ?? null
  } catch {
    // keep the stored link
  }
  const reposts = (v.reposts ?? 0) + (v.quotes ?? 0)
  return {
    permalink,
    metrics: compact({
      views: v.views,
      likes: v.likes,
      comments: v.replies,
      shares: v.shares !== undefined || v.reposts !== undefined ? (v.shares ?? 0) + reposts : undefined,
    }),
  }
}

async function youtubeMetrics(account: ActiveAccount, postId: string): Promise<MetricsResult> {
  const body = await socialJson<{ items?: { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>(
    `${YOUTUBE_API}/videos?part=statistics&id=${encodeURIComponent(postId)}`,
    { headers: { Authorization: `Bearer ${account.accessToken}` } },
  )
  const stats = body.items?.[0]?.statistics
  return {
    permalink: `https://www.youtube.com/shorts/${postId}`,
    metrics: compact({ views: num(stats?.viewCount), likes: num(stats?.likeCount), comments: num(stats?.commentCount) }),
  }
}

async function tiktokMetrics(account: ActiveAccount, postId: string): Promise<MetricsResult> {
  const body = await socialJson<{ data?: { videos?: { share_url?: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[] } }>(
    `${TIKTOK_API}/video/query/?fields=id,share_url,view_count,like_count,comment_count,share_count`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ filters: { video_ids: [postId] } }),
    },
  )
  const video = body.data?.videos?.[0]
  return {
    permalink: video?.share_url ?? null,
    metrics: compact({ views: num(video?.view_count), likes: num(video?.like_count), comments: num(video?.comment_count), shares: num(video?.share_count) }),
  }
}

export function fetchPostMetrics(platform: SocialPlatform, account: ActiveAccount, externalPostId: string): Promise<MetricsResult> {
  switch (platform) {
    case 'instagram':
      return instagramMetrics(account, externalPostId)
    case 'threads':
      return threadsMetrics(account, externalPostId)
    case 'youtube':
      return youtubeMetrics(account, externalPostId)
    case 'tiktok':
      return tiktokMetrics(account, externalPostId)
  }
}
