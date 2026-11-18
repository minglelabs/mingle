import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  marketingVideoTarget: { update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const accountsMock = vi.hoisted(() => ({ getActiveAccount: vi.fn(), refreshExpiringAccounts: vi.fn() }))
vi.mock('./accounts', () => accountsMock)

const publishMock = vi.hoisted(() => ({ runPublishStep: vi.fn() }))
vi.mock('./publishers', () => publishMock)

const metricsMock = vi.hoisted(() => ({ fetchPostMetrics: vi.fn() }))
vi.mock('./metrics', () => metricsMock)

import { SocialApiError } from './http'
import { advanceTarget, backoffMs, metricsDue, refreshTargetMetrics, runMarketingSocialWorker } from './worker'

const NOW = new Date('2026-11-18T03:00:00Z')

function target(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    videoId: 'v1',
    platform: 'instagram',
    caption: 'hi',
    options: null,
    status: 'queued',
    containerId: null,
    externalPostId: null,
    permalink: null,
    error: null,
    attempts: 0,
    nextAttemptAt: NOW,
    startedAt: null,
    publishedAt: null,
    metrics: null,
    metricsFetchedAt: null,
    metricsError: null,
    createdAt: NOW,
    updatedAt: NOW,
    video: { id: 'v1', title: 'T', videoUrl: 'https://cdn/v.mp4', videoBytes: 10, coverUrl: null, hashtags: [] },
    ...overrides,
  } as never
}

function lastUpdate() {
  return prismaMock.marketingVideoTarget.update.mock.calls.at(-1)?.[0].data
}

describe('marketing social worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    accountsMock.getActiveAccount.mockResolvedValue({ platform: 'instagram', externalAccountId: 'a', username: 'u', accessToken: 'tok' })
    accountsMock.refreshExpiringAccounts.mockResolvedValue(0)
  })

  it('moves a started upload to processing with its container id', async () => {
    publishMock.runPublishStep.mockResolvedValue({ kind: 'processing', containerId: 'c1', retryInMs: 10_000 })
    expect(await advanceTarget(target(), NOW)).toBe('processing')
    expect(lastUpdate()).toMatchObject({ status: 'processing', containerId: 'c1', error: null })
  })

  it('marks a finished post published with its link', async () => {
    publishMock.runPublishStep.mockResolvedValue({ kind: 'published', externalPostId: 'm1', permalink: 'https://ig/p' })
    expect(await advanceTarget(target({ status: 'processing', containerId: 'c1', startedAt: NOW }), NOW)).toBe('published')
    expect(lastUpdate()).toMatchObject({ status: 'published', externalPostId: 'm1', permalink: 'https://ig/p' })
  })

  it('retries transient errors with backoff, then gives up', async () => {
    publishMock.runPublishStep.mockRejectedValue(new SocialApiError('rate limited', 429, true))
    expect(await advanceTarget(target({ attempts: 0 }), NOW)).toBe('retried')
    expect(lastUpdate()).toMatchObject({ attempts: 1, error: '재시도 예정: rate limited' })
    expect(lastUpdate().status).toBeUndefined()
    expect(await advanceTarget(target({ attempts: 4 }), NOW)).toBe('failed')
    expect(lastUpdate()).toMatchObject({ status: 'failed', error: 'rate limited' })
  })

  it('fails permanent errors at once, with the platform reason', async () => {
    publishMock.runPublishStep.mockRejectedValue(new SocialApiError('unaudited client can only post to private accounts', 403, false))
    expect(await advanceTarget(target(), NOW)).toBe('failed')
    expect(lastUpdate()).toMatchObject({ status: 'failed', error: 'unaudited client can only post to private accounts' })
  })

  it('fails a post the platform has been processing for over 30 minutes', async () => {
    const startedAt = new Date(NOW.getTime() - 31 * 60_000)
    expect(await advanceTarget(target({ status: 'processing', containerId: 'c1', startedAt }), NOW)).toBe('failed')
    expect(publishMock.runPublishStep).not.toHaveBeenCalled()
  })

  it('backs off 1, 2, 4, 8, 16 minutes', () => {
    expect([1, 2, 3, 4, 5, 9].map(backoffMs)).toEqual([60_000, 120_000, 240_000, 480_000, 960_000, 960_000])
  })

  it('schedules metrics hourly for 2 days, then every 6 h, up to 30 days', () => {
    const at = (h: number) => new Date(NOW.getTime() - h * 3600_000)
    expect(metricsDue({ publishedAt: new Date(NOW.getTime() - 5 * 60_000), metricsFetchedAt: null }, NOW)).toBe(false)
    expect(metricsDue({ publishedAt: at(1), metricsFetchedAt: null }, NOW)).toBe(true)
    expect(metricsDue({ publishedAt: at(10), metricsFetchedAt: at(0.5) }, NOW)).toBe(false)
    expect(metricsDue({ publishedAt: at(10), metricsFetchedAt: at(1) }, NOW)).toBe(true)
    expect(metricsDue({ publishedAt: at(72), metricsFetchedAt: at(3) }, NOW)).toBe(false)
    expect(metricsDue({ publishedAt: at(72), metricsFetchedAt: at(6) }, NOW)).toBe(true)
    expect(metricsDue({ publishedAt: at(31 * 24), metricsFetchedAt: null }, NOW)).toBe(false)
  })

  it('stores metrics, or the metrics error', async () => {
    metricsMock.fetchPostMetrics.mockResolvedValue({ metrics: { views: 10, likes: 2 }, permalink: null })
    expect(await refreshTargetMetrics(target({ status: 'published', externalPostId: 'm1' }) as never, NOW)).toBe(true)
    expect(lastUpdate()).toMatchObject({ metrics: { views: 10, likes: 2 }, metricsError: null })
    metricsMock.fetchPostMetrics.mockRejectedValue(new Error('insights not available'))
    expect(await refreshTargetMetrics(target({ status: 'published', externalPostId: 'm1' }) as never, NOW)).toBe(false)
    expect(lastUpdate()).toMatchObject({ metricsError: 'insights not available' })
    expect(await refreshTargetMetrics(target({ status: 'published', externalPostId: null }) as never, NOW)).toBe(false)
  })

  it('skips a target another run already claimed', async () => {
    prismaMock.marketingVideoTarget.findMany.mockResolvedValueOnce([target()]).mockResolvedValueOnce([])
    prismaMock.marketingVideoTarget.updateMany.mockResolvedValue({ count: 0 })
    const summary = await runMarketingSocialWorker(NOW)
    expect(publishMock.runPublishStep).not.toHaveBeenCalled()
    expect(summary).toEqual({ published: 0, processing: 0, failed: 0, retried: 0, metrics: 0, tokens: 0 })
  })
})
