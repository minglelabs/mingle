import type { MarketingVideo, MarketingVideoTarget, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getActiveAccount, refreshExpiringAccounts } from './accounts'
import { SocialApiError } from './http'
import { fetchPostMetrics } from './metrics'
import { runPublishStep } from './publishers'
import type { SocialPlatform, TargetOptions } from './types'

/**
 * Advances marketing video targets one step per tick:
 * queued → (upload) → processing → (poll) → published | failed.
 * Also keeps Meta tokens alive and refreshes metrics of recent posts.
 */
export const LEASE_MS = 10 * 60_000
export const PROCESSING_TIMEOUT_MS = 30 * 60_000
export const MAX_TRANSIENT_ATTEMPTS = 5
const BATCH = 8

type TargetWithVideo = MarketingVideoTarget & { video: MarketingVideo }

export type WorkerSummary = { published: number; processing: number; failed: number; retried: number; metrics: number; tokens: number }

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1000)
  return 'unknown error'
}

/** Retry delay after a transient failure: 1, 2, 4, 8 minutes. */
export function backoffMs(attempts: number): number {
  return 60_000 * 2 ** Math.max(0, Math.min(attempts - 1, 4))
}

async function claim(target: MarketingVideoTarget, now: Date): Promise<boolean> {
  const claimed = await prisma.marketingVideoTarget.updateMany({
    where: { id: target.id, status: target.status, nextAttemptAt: target.nextAttemptAt },
    data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS), ...(target.startedAt ? {} : { startedAt: now }) },
  })
  return claimed.count === 1
}

export async function advanceTarget(target: TargetWithVideo, now = new Date()): Promise<'published' | 'processing' | 'failed' | 'retried'> {
  const platform = target.platform as SocialPlatform
  const startedAt = target.startedAt ?? now
  if (target.containerId && now.getTime() - startedAt.getTime() > PROCESSING_TIMEOUT_MS) {
    await prisma.marketingVideoTarget.update({ where: { id: target.id }, data: { status: 'failed', error: '플랫폼 처리 시간 초과 (30분)' } })
    return 'failed'
  }
  try {
    const account = await getActiveAccount(platform, now)
    const result = await runPublishStep(platform, {
      caption: target.caption,
      options: (target.options as TargetOptions | null) ?? null,
      containerId: target.containerId,
      video: {
        title: target.video.title,
        videoUrl: target.video.videoUrl,
        videoBytes: target.video.videoBytes,
        coverUrl: target.video.coverUrl,
        hashtags: target.video.hashtags,
      },
      account,
    })
    if (result.kind === 'processing') {
      await prisma.marketingVideoTarget.update({
        where: { id: target.id },
        data: { status: 'processing', containerId: result.containerId, error: null, nextAttemptAt: new Date(Date.now() + result.retryInMs) },
      })
      return 'processing'
    }
    await prisma.marketingVideoTarget.update({
      where: { id: target.id },
      data: {
        status: 'published',
        externalPostId: result.externalPostId,
        permalink: result.permalink,
        ...(result.containerId ? { containerId: result.containerId } : {}),
        error: null,
        publishedAt: new Date(),
        nextAttemptAt: new Date(),
      },
    })
    return 'published'
  } catch (error) {
    const transient = error instanceof SocialApiError ? error.transient : true
    const attempts = target.attempts + 1
    if (transient && attempts < MAX_TRANSIENT_ATTEMPTS) {
      await prisma.marketingVideoTarget.update({
        where: { id: target.id },
        data: { attempts, error: `재시도 예정: ${errorMessage(error)}`, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)) },
      })
      return 'retried'
    }
    await prisma.marketingVideoTarget.update({ where: { id: target.id }, data: { attempts, status: 'failed', error: errorMessage(error) } })
    return 'failed'
  }
}

/** Fetch and store one published target's metrics (and its link, if the platform gives a better one). */
export async function refreshTargetMetrics(target: MarketingVideoTarget, now = new Date()): Promise<boolean> {
  if (target.status !== 'published' || !target.externalPostId) return false
  try {
    const account = await getActiveAccount(target.platform as SocialPlatform, now)
    const result = await fetchPostMetrics(target.platform as SocialPlatform, account, target.externalPostId)
    await prisma.marketingVideoTarget.update({
      where: { id: target.id },
      data: {
        metrics: result.metrics as Prisma.InputJsonValue,
        metricsFetchedAt: now,
        metricsError: null,
        ...(result.permalink ? { permalink: result.permalink } : {}),
      },
    })
    return true
  } catch (error) {
    await prisma.marketingVideoTarget.update({ where: { id: target.id }, data: { metricsFetchedAt: now, metricsError: errorMessage(error) } })
    return false
  }
}

/** Metrics are refreshed hourly for two days after posting, then every 6 h, for 30 days. */
export function metricsDue(target: Pick<MarketingVideoTarget, 'publishedAt' | 'metricsFetchedAt'>, now: Date): boolean {
  if (!target.publishedAt) return false
  const age = now.getTime() - target.publishedAt.getTime()
  if (age > 30 * 24 * 3600_000) return false
  if (!target.metricsFetchedAt) return age >= 10 * 60_000
  const interval = age < 48 * 3600_000 ? 3600_000 : 6 * 3600_000
  return now.getTime() - target.metricsFetchedAt.getTime() >= interval
}

export async function runMarketingSocialWorker(now = new Date()): Promise<WorkerSummary> {
  const summary: WorkerSummary = { published: 0, processing: 0, failed: 0, retried: 0, metrics: 0, tokens: 0 }
  summary.tokens = await refreshExpiringAccounts(now)

  const due = await prisma.marketingVideoTarget.findMany({
    where: { status: { in: ['queued', 'processing'] }, nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH,
    include: { video: true },
  })
  for (const target of due) {
    if (!(await claim(target, now))) continue
    const outcome = await advanceTarget(target, now)
    summary[outcome] += 1
  }

  const since = new Date(now.getTime() - 30 * 24 * 3600_000)
  const published = await prisma.marketingVideoTarget.findMany({
    where: { status: 'published', externalPostId: { not: null }, publishedAt: { gte: since } },
    orderBy: [{ metricsFetchedAt: { sort: 'asc', nulls: 'first' } }],
    take: 50,
  })
  for (const target of published.filter((t) => metricsDue(t, now)).slice(0, BATCH)) {
    if (await refreshTargetMetrics(target, now)) summary.metrics += 1
  }
  return summary
}
