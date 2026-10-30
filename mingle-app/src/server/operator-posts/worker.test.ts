import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  jobUpdateMany: vi.fn(),
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  publishPost: vi.fn(),
  audit: vi.fn(),
  rateLimit: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: m.queryRaw,
    operatorPostJob: { updateMany: m.jobUpdateMany },
    user: { findFirst: m.userFindFirst, findUnique: m.userFindUnique },
  },
}))
vi.mock('@/server/posts/publish-post', () => ({ publishPost: m.publishPost }))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: m.audit }))
vi.mock('@/server/rate-limit/rate-limit', () => ({ rateLimitGuard: m.rateLimit, checkRateLimit: m.rateLimit }))

import {
  OPERATOR_POST_MAX_ATTEMPTS,
  claimDueOperatorPostJobs,
  operatorPostRetryDelayMs,
  publishClaimedOperatorPostJob,
  requeueStalePublishingJobs,
  runDueOperatorPostJobs,
  type ClaimedOperatorPostJob,
} from './worker'

const NOW = new Date('2026-10-01T03:00:00.000Z')
const clock = () => NOW
const KEY = 'post-images/op_1/123e4567-e89b-42d3-a456-426614174000.jpg'

function job(overrides: Partial<ClaimedOperatorPostJob> = {}): ClaimedOperatorPostJob {
  return {
    id: 'job_1',
    batchId: 'batch_1',
    operatorUserId: 'op_1',
    clientPostId: 'op-batch_1-1',
    text: 'Olá, pessoal!',
    imageObjectKey: null,
    imageWidth: null,
    imageHeight: null,
    backgroundKey: 'ocean-blue',
    attempts: 1,
    ...overrides,
  }
}

function operator(overrides: Record<string, unknown> = {}) {
  return {
    id: 'op_1',
    handle: 'lucas',
    name: 'Lucas',
    image: null,
    primaryLanguages: ['pt'],
    defaultConversationLanguages: ['pt'],
    defaultDisplayLanguage: 'pt',
    isActive: true,
    ...overrides,
  }
}

function created(id = 'op-batch_1-1') {
  return {
    kind: 'created',
    post: { id, backgroundKey: 'ocean-blue', publishedAt: NOW },
    sourceLanguage: 'pt',
    translations: [],
  }
}

function lastSettle() {
  return m.jobUpdateMany.mock.calls.at(-1)?.[0]
}

beforeEach(() => {
  vi.resetAllMocks()
  m.userFindFirst.mockResolvedValue(operator())
  m.userFindUnique.mockResolvedValue({ moderationRestrictedAt: null })
  m.jobUpdateMany.mockResolvedValue({ count: 1 })
  m.audit.mockResolvedValue(undefined)
})

describe('claimDueOperatorPostJobs', () => {
  it('claims atomically: one UPDATE over a SKIP LOCKED sub-select of due queued jobs, bumping attempts', async () => {
    m.queryRaw.mockResolvedValue([job()])
    await expect(claimDueOperatorPostJobs(NOW, 3)).resolves.toEqual([job()])
    const [strings, ...values] = m.queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    const query = Prisma.sql(strings, ...values)
    const sql = query.sql.replace(/\s+/g, ' ')
    expect(sql).toContain("UPDATE app_operator_post_jobs SET state = 'publishing', attempts = attempts + 1")
    expect(sql).toContain("WHERE id IN ( SELECT id FROM app_operator_post_jobs WHERE state = 'queued' AND publish_at <= ")
    expect(sql).toContain('ORDER BY publish_at ASC, id ASC LIMIT ? FOR UPDATE SKIP LOCKED )')
    expect(sql).toContain('RETURNING')
    // The caller's clock, bound as UTC (the DB session time zone is not UTC).
    expect(sql).toContain("::timestamptz AT TIME ZONE 'UTC'")
    expect(query.values).toEqual([NOW.toISOString(), NOW.toISOString(), 3])
  })
})

describe('publishClaimedOperatorPostJob', () => {
  it('publishes through the unchanged publishPost with the job clientPostId and records the post', async () => {
    m.publishPost.mockResolvedValue(created())
    await expect(publishClaimedOperatorPostJob(job(), clock)).resolves.toBe('published')
    expect(m.publishPost).toHaveBeenCalledWith({
      authorId: 'op_1',
      text: 'Olá, pessoal!',
      imageObjectKey: null,
      imageDimensions: null,
      clientHint: 'pt',
      clientPostId: 'op-batch_1-1',
      backgroundKey: 'ocean-blue',
    })
    expect(lastSettle()).toEqual({
      where: { id: 'job_1', state: 'publishing', attempts: 1 },
      data: { state: 'published', postId: 'op-batch_1-1', error: null },
    })
    expect(m.audit).toHaveBeenCalledWith(null, {
      action: 'operator_post.published',
      operatorUserId: 'op_1',
      targetType: 'post',
      targetId: 'op-batch_1-1',
      metadata: {
        jobId: 'job_1',
        batchId: 'batch_1',
        clientPostId: 'op-batch_1-1',
        result: 'created',
        sourceLanguage: 'pt',
      },
    })
    expect(m.rateLimit).not.toHaveBeenCalled()
  })

  it('passes the image and its dimensions', async () => {
    m.publishPost.mockResolvedValue(created())
    await publishClaimedOperatorPostJob(job({ text: null, imageObjectKey: KEY, imageWidth: 1200, imageHeight: 900 }), clock)
    expect(m.publishPost).toHaveBeenCalledWith(
      expect.objectContaining({ text: null, imageObjectKey: KEY, imageDimensions: { imageWidth: 1200, imageHeight: 900 } }),
    )
  })

  it('records a retried publish that already exists as duplicate, with its post id', async () => {
    m.publishPost.mockResolvedValue({ kind: 'duplicate', post: { id: 'op-batch_1-1', backgroundKey: null, publishedAt: NOW } })
    await expect(publishClaimedOperatorPostJob(job({ attempts: 2 }), clock)).resolves.toBe('duplicate')
    expect(lastSettle()).toEqual({
      where: { id: 'job_1', state: 'publishing', attempts: 2 },
      data: { state: 'duplicate', postId: 'op-batch_1-1', error: null },
    })
    expect(m.audit).toHaveBeenCalledWith(null, expect.objectContaining({ metadata: expect.objectContaining({ result: 'duplicate' }) }))
  })

  it('marks a clientPostId taken by another author as conflict, without retrying', async () => {
    m.publishPost.mockResolvedValue({ kind: 'conflict' })
    await expect(publishClaimedOperatorPostJob(job(), clock)).resolves.toBe('conflict')
    expect(lastSettle()?.data).toEqual({ state: 'conflict', error: 'client_post_id_conflict' })
    expect(m.audit).not.toHaveBeenCalled()
  })

  it('requeues an error with a 2^attempts minute backoff and keeps the error', async () => {
    m.publishPost.mockRejectedValue(new Error('connection reset'))
    await expect(publishClaimedOperatorPostJob(job({ attempts: 2 }), clock)).resolves.toBe('retried')
    expect(lastSettle()).toEqual({
      where: { id: 'job_1', state: 'publishing', attempts: 2 },
      data: {
        state: 'queued',
        error: 'Error: connection reset',
        publishAt: new Date(NOW.getTime() + 4 * 60_000),
      },
    })
    expect([1, 2, 3, 4].map(operatorPostRetryDelayMs)).toEqual([2, 4, 8, 16].map((minutes) => minutes * 60_000))
  })

  it('fails the job with the error after the fifth attempt', async () => {
    m.publishPost.mockRejectedValue(new Error('still broken'))
    await expect(publishClaimedOperatorPostJob(job({ attempts: OPERATOR_POST_MAX_ATTEMPTS }), clock)).resolves.toBe('failed')
    expect(lastSettle()?.data).toEqual({ state: 'failed', error: 'Error: still broken' })
  })

  it.each([
    ['no longer an operator', () => m.userFindFirst.mockResolvedValue(null), 'not_operator'],
    ['retired meanwhile', () => m.userFindFirst.mockResolvedValue(operator({ isActive: false })), 'operator_inactive'],
    [
      'restricted meanwhile',
      () => m.userFindUnique.mockResolvedValue({ moderationRestrictedAt: new Date() }),
      'account_restricted',
    ],
  ])('never publishes as an account that is %s', async (_label, arrange, error) => {
    arrange()
    await expect(publishClaimedOperatorPostJob(job(), clock)).resolves.toBe('failed')
    expect(m.publishPost).not.toHaveBeenCalled()
    expect(lastSettle()?.data).toEqual({ state: 'failed', error })
  })

  it('refuses an image key the operator was not issued', async () => {
    await publishClaimedOperatorPostJob(job({ imageObjectKey: 'post-images/op_2/123e4567-e89b-42d3-a456-426614174000.jpg' }), clock)
    expect(m.publishPost).not.toHaveBeenCalled()
    expect(lastSettle()?.data).toEqual({ state: 'failed', error: 'invalid_image_key' })
  })

  it('does not throw when the final write fails (the stale requeue repeats it as a duplicate)', async () => {
    m.publishPost.mockResolvedValue(created())
    m.jobUpdateMany.mockRejectedValue(new Error('db down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(publishClaimedOperatorPostJob(job(), clock)).resolves.toBe('published')
      expect(error).toHaveBeenCalledWith('[operator-post-worker] settle_failed', expect.objectContaining({ jobId: 'job_1' }))
    } finally {
      error.mockRestore()
    }
  })
})

describe('requeueStalePublishingJobs', () => {
  it('requeues claims older than 10 minutes, failing those out of attempts first', async () => {
    m.jobUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 2 })
    await expect(requeueStalePublishingJobs(NOW)).resolves.toEqual({ requeued: 2, failed: 1 })
    const cutoff = new Date(NOW.getTime() - 10 * 60_000)
    expect(m.jobUpdateMany.mock.calls[0][0]).toEqual({
      where: { state: 'publishing', updatedAt: { lt: cutoff }, attempts: { gte: 5 } },
      data: { state: 'failed', error: 'publish_timed_out' },
    })
    expect(m.jobUpdateMany.mock.calls[1][0]).toEqual({
      where: { state: 'publishing', updatedAt: { lt: cutoff } },
      data: { state: 'queued', error: 'publish_interrupted' },
    })
  })
})

describe('runDueOperatorPostJobs', () => {
  it('publishes due jobs with at most 3 in flight, until nothing is due', async () => {
    m.jobUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // no stale claim out of attempts
      .mockResolvedValueOnce({ count: 0 }) // no stale claim to requeue
      .mockResolvedValue({ count: 1 })
    const queue = Array.from({ length: 7 }, (_, index) => job({ id: `job_${index + 1}`, clientPostId: `op-b-${index + 1}` }))
    m.queryRaw.mockImplementation(async () => {
      const next = queue.shift()
      return next ? [next] : []
    })
    let inFlight = 0
    let maxInFlight = 0
    m.publishPost.mockImplementation(async (input: { clientPostId: string }) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return created(input.clientPostId)
    })

    const summary = await runDueOperatorPostJobs({ now: clock })
    expect(summary).toMatchObject({ claimed: 7, published: 7, failed: 0, retried: 0 })
    expect(maxInFlight).toBe(3)
    expect(m.publishPost).toHaveBeenCalledTimes(7)
  })

  it('stops after maxJobs claims and reports stale requeues', async () => {
    m.jobUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // exhausted stale → failed
      .mockResolvedValueOnce({ count: 4 }) // stale → queued
      .mockResolvedValue({ count: 1 })
    m.queryRaw.mockImplementation(async () => [job()])
    m.publishPost.mockResolvedValue(created())
    const summary = await runDueOperatorPostJobs({ now: clock, maxJobs: 2, concurrency: 3 })
    expect(summary).toMatchObject({ staleRequeued: 4, staleFailed: 0, claimed: 2, published: 2 })
    expect(m.queryRaw).toHaveBeenCalledTimes(2)
  })

  it('does nothing when no job is due', async () => {
    m.jobUpdateMany.mockResolvedValue({ count: 0 })
    m.queryRaw.mockResolvedValue([])
    await expect(runDueOperatorPostJobs({ now: clock })).resolves.toMatchObject({ claimed: 0, published: 0 })
    expect(m.publishPost).not.toHaveBeenCalled()
  })
})
