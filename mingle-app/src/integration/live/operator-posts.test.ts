import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Opt in only with a dedicated, migrated loopback PostgreSQL test database.
// A remote host, a non-test database name, a schema other than `app`, or a
// connection-string host override is rejected before a Prisma client is made.
const context = vi.hoisted(() => {
  const url = process.env.OPERATOR_POSTS_TEST_DATABASE_URL?.trim() || null
  if (!url) return { url: null }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('OPERATOR_POSTS_TEST_DATABASE_URL must be a local PostgreSQL test URL.')
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const localHosts = new Set(['localhost', '127.0.0.1', '::1'])
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  const hasHostOverride = ['host', 'hostaddr', 'service'].some((name) => parsed.searchParams.has(name))
  const safe =
    ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
    localHosts.has(hostname) &&
    /test/i.test(databaseName) &&
    parsed.searchParams.get('schema') === 'app' &&
    !hasHostOverride
  if (!safe) {
    throw new Error(
      'OPERATOR_POSTS_TEST_DATABASE_URL must use localhost/loopback, a database name containing "test", schema=app, and no host override.',
    )
  }
  return { url }
})

const mocks = vi.hoisted(() => ({ publishPost: vi.fn(), writeAdminAudit: vi.fn() }))

vi.mock('@/lib/prisma', async () => {
  const { PrismaClient: TestPrismaClient } = await import('@prisma/client')
  return {
    prisma: new TestPrismaClient({
      datasources: {
        db: { url: context.url ?? 'postgresql://unused@127.0.0.1:1/operator_posts_test?schema=app' },
      },
    }),
  }
})
vi.mock('@/server/posts/publish-post', () => ({ POST_BODY_MAX_LENGTH: 1000, publishPost: mocks.publishPost }))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: mocks.writeAdminAudit }))

import { prisma } from '@/lib/prisma'
import { cancelOperatorPostJobs, createOperatorPostBatch } from '@/server/operator-posts/jobs'
import { claimDueOperatorPostJobs } from '@/server/operator-posts/worker'
import type { AdminContext } from '@/server/admin/guard'

const db = prisma as PrismaClient
const suffix = randomUUID().replaceAll('-', '')
const operatorIds = [`ops_post_test_${suffix}_a`, `ops_post_test_${suffix}_b`]
const [operatorA, operatorB] = operatorIds
const batchPrefix = `operator-posts-test-${suffix}`
const NOW = new Date('2035-04-05T06:07:08.000Z')
const ctx: AdminContext = { sessionId: null, ip: null, userAgent: null }
const integrationSuite = describe.skipIf(!context.url).sequential

async function clearFixtureJobs() {
  await db.operatorPostJob.deleteMany({ where: { operatorUserId: { in: operatorIds } } })
}

async function seedQueuedJobs(args: {
  count: number
  operatorUserId?: string
  batchId: string
  publishAt: Date
}) {
  const operatorUserId = args.operatorUserId ?? operatorA
  await db.operatorPostJob.createMany({
    data: Array.from({ length: args.count }, (_, index) => ({
      batchId: args.batchId,
      operatorUserId,
      clientPostId: `op-${suffix}-${args.batchId.length}-${index + 1}`,
      text: 'isolated operator post fixture',
      publishAt: args.publishAt,
      state: 'queued',
    })),
  })
}

integrationSuite('operator post jobs with a real local PostgreSQL database', () => {
  beforeAll(async () => {
    await db.user.createMany({
      data: operatorIds.map((id, index) => ({
        id,
        handle: `${id}_handle`,
        name: `Operator Posts Test ${index + 1}`,
        isOperator: true,
        primaryLanguages: ['pt'],
        defaultConversationLanguages: ['pt'],
        defaultDisplayLanguage: 'pt',
      })),
    })
    await db.operatorAccount.createMany({ data: operatorIds.map((userId) => ({ userId })) })
  })

  beforeEach(async () => {
    await clearFixtureJobs()
    mocks.publishPost.mockReset().mockImplementation(() => {
      throw new Error('Publishing is disabled in this integration test.')
    })
    mocks.writeAdminAudit.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    expect(mocks.publishPost).not.toHaveBeenCalled()
  })

  afterAll(async () => {
    try {
      await clearFixtureJobs()
      await db.operatorAccount.deleteMany({ where: { userId: { in: operatorIds } } })
      await db.user.deleteMany({ where: { id: { in: operatorIds } } })
    } finally {
      await db.$disconnect()
    }
  })

  it('claims a due job and leaves its future sibling queued', async () => {
    await db.operatorPostJob.createMany({
      data: [
        {
          batchId: `${batchPrefix}-due`,
          operatorUserId: operatorA,
          clientPostId: `op-${suffix}-due`,
          text: 'due fixture',
          publishAt: NOW,
          state: 'queued',
        },
        {
          batchId: `${batchPrefix}-future`,
          operatorUserId: operatorA,
          clientPostId: `op-${suffix}-future`,
          text: 'future fixture',
          publishAt: new Date(NOW.getTime() + 60_000),
          state: 'queued',
        },
      ],
    })

    const claimed = await claimDueOperatorPostJobs(NOW, 10)
    expect(claimed.map((job) => job.clientPostId)).toEqual([`op-${suffix}-due`])

    const future = await db.operatorPostJob.findUniqueOrThrow({
      where: { clientPostId: `op-${suffix}-future` },
      select: { state: true, attempts: true },
    })
    expect(future).toEqual({ state: 'queued', attempts: 0 })
  })

  it('lets concurrent claimers take disjoint due jobs exactly once', async () => {
    const count = 12
    await seedQueuedJobs({
      count,
      batchId: `${batchPrefix}-claims`,
      publishAt: new Date(NOW.getTime() - 60_000),
    })

    const [first, second] = await Promise.all([
      claimDueOperatorPostJobs(NOW, 8),
      claimDueOperatorPostJobs(NOW, 8),
    ])
    const firstIds = new Set(first.map((job) => job.id))
    const secondIds = new Set(second.map((job) => job.id))
    const overlap = [...firstIds].filter((id) => secondIds.has(id))

    expect(overlap).toEqual([])
    expect(first.length + second.length).toBe(count)
    expect(await db.operatorPostJob.count({
      where: { operatorUserId: operatorA, batchId: `${batchPrefix}-claims`, state: 'publishing', attempts: 1 },
    })).toBe(count)
  })

  it('spaces a new default batch from an existing queued job of the same operator', async () => {
    const earlierAt = new Date(NOW.getTime() + 5 * 60_000)
    await seedQueuedJobs({ count: 1, batchId: `${batchPrefix}-anchor`, publishAt: earlierAt })

    const result = await createOperatorPostBatch(
      ctx,
      [
        { operatorUserId: operatorA, text: 'Portuguese fixture A' },
        { operatorUserId: operatorB, text: 'Portuguese fixture B' },
      ],
      { now: NOW, random: () => 0 },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const jobs = await db.operatorPostJob.findMany({
      where: { batchId: result.batchId ?? '' },
      select: { operatorUserId: true, publishAt: true },
    })
    const timeA = jobs.find((job) => job.operatorUserId === operatorA)?.publishAt
    const timeB = jobs.find((job) => job.operatorUserId === operatorB)?.publishAt
    expect(timeA?.getTime()).toBeGreaterThanOrEqual(earlierAt.getTime() + 30 * 60_000)
    expect(timeB?.getTime()).toBe(NOW.getTime() + 2 * 60_000)
  })

  it('cancels only queued jobs in the requested batch using the raw update', async () => {
    const cancelBatch = `${batchPrefix}-cancel`
    const [queued, otherBatch, publishing] = await Promise.all([
      db.operatorPostJob.create({
        data: {
          batchId: cancelBatch,
          operatorUserId: operatorA,
          clientPostId: `op-${suffix}-cancel-queued`,
          text: 'queued fixture',
          publishAt: NOW,
          state: 'queued',
        },
        select: { id: true },
      }),
      db.operatorPostJob.create({
        data: {
          batchId: `${cancelBatch}-other`,
          operatorUserId: operatorA,
          clientPostId: `op-${suffix}-cancel-other`,
          text: 'other batch fixture',
          publishAt: NOW,
          state: 'queued',
        },
        select: { id: true },
      }),
      db.operatorPostJob.create({
        data: {
          batchId: cancelBatch,
          operatorUserId: operatorA,
          clientPostId: `op-${suffix}-cancel-publishing`,
          text: 'publishing fixture',
          publishAt: NOW,
          state: 'publishing',
          attempts: 1,
        },
        select: { id: true },
      }),
    ])

    const result = await cancelOperatorPostJobs(ctx, [queued.id, otherBatch.id, publishing.id], {
      batchId: cancelBatch,
      now: NOW,
    })
    expect(result.cancelled.map((job) => job.id)).toEqual([queued.id])

    const remaining = await db.operatorPostJob.findMany({
      where: { id: { in: [queued.id, otherBatch.id, publishing.id] } },
      select: { id: true, state: true },
    })
    expect(Object.fromEntries(remaining.map((job) => [job.id, job.state]))).toEqual({
      [queued.id]: 'cancelled',
      [otherBatch.id]: 'queued',
      [publishing.id]: 'publishing',
    })
  })

  it('serializes concurrent inserts at the 500-job queue cap', async () => {
    await seedQueuedJobs({
      count: 499,
      batchId: `${batchPrefix}-cap`,
      publishAt: new Date(NOW.getTime() + 24 * 60 * 60_000),
    })

    const results = await Promise.all([
      createOperatorPostBatch(ctx, [{ operatorUserId: operatorA, text: 'immediate fixture', publishAt: 'now' }], { now: NOW }),
      createOperatorPostBatch(ctx, [{ operatorUserId: operatorA, text: 'immediate fixture', publishAt: 'now' }], { now: NOW }),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok && result.error === 'queue_full')).toHaveLength(1)
    expect(await db.operatorPostJob.count({ where: { operatorUserId: operatorA, state: 'queued' } })).toBe(500)
  })
})
