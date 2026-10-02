import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  jobCount: vi.fn(),
  jobFindMany: vi.fn(),
  jobCreateManyAndReturn: vi.fn(),
  jobGroupBy: vi.fn(),
  postGroupBy: vi.fn(),
  queryRaw: vi.fn(),
  transactionQueryRaw: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: m.userFindFirst, findUnique: m.userFindUnique, findMany: m.userFindMany },
    operatorPostJob: {
      count: m.jobCount,
      findMany: m.jobFindMany,
      createManyAndReturn: m.jobCreateManyAndReturn,
      groupBy: m.jobGroupBy,
    },
    post: { groupBy: m.postGroupBy },
    $queryRaw: m.queryRaw,
    $transaction: m.transaction,
  },
}))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: m.audit }))

import { CLIENT_POST_ID_PATTERN } from '@/server/posts/publish-post'
import {
  cancelOperatorPostJobs,
  createOperatorPostBatch,
  getOperatorPostBatch,
  listRecentOperatorPostBatches,
  operatorPostItemNumber,
} from './jobs'
import { MIN_OPERATOR_GAP_MS, SPREAD_START_DELAY_MS } from './schedule'

const NOW = new Date('2026-10-01T03:00:00.000Z')
const MIN = 60_000
const ctx = { sessionId: 'admin_sess_1', ip: '203.0.113.7', userAgent: 'Mozilla/5.0' }
const KEY_OP1 = 'post-images/op_1/123e4567-e89b-42d3-a456-426614174000.jpg'
const KEY_OP2 = 'post-images/op_2/123e4567-e89b-42d3-a456-426614174001.jpg'

type Account = { id: string; isActive: boolean; primaryLanguages: string[]; restricted?: boolean }
const ACCOUNTS: Record<string, Account> = {
  op_1: { id: 'op_1', isActive: true, primaryLanguages: ['pt'] },
  op_2: { id: 'op_2', isActive: true, primaryLanguages: ['ja'] },
  op_off: { id: 'op_off', isActive: false, primaryLanguages: ['en'] },
  op_ban: { id: 'op_ban', isActive: true, primaryLanguages: ['en'], restricted: true },
}

function create(items: unknown, options: { random?: () => number } = {}) {
  return createOperatorPostBatch(ctx, items, { now: NOW, random: options.random ?? (() => 0) })
}

function insertedRows(): Array<Record<string, unknown>> {
  return m.jobCreateManyAndReturn.mock.calls[0]?.[0]?.data ?? []
}

function rawQuery(call = 0): Prisma.Sql {
  const [strings, ...values] = m.queryRaw.mock.calls[call] as [TemplateStringsArray, ...unknown[]]
  return Prisma.sql(strings, ...values)
}

beforeEach(() => {
  vi.resetAllMocks()
  m.userFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const account = ACCOUNTS[where.id]
    return account
      ? {
          id: account.id,
          handle: account.id,
          name: account.id,
          image: null,
          primaryLanguages: account.primaryLanguages,
          defaultConversationLanguages: account.primaryLanguages,
          defaultDisplayLanguage: account.primaryLanguages[0],
          isActive: account.isActive,
        }
      : null
  })
  m.userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    moderationRestrictedAt: ACCOUNTS[where.id]?.restricted ? new Date('2026-09-01T00:00:00Z') : null,
  }))
  m.jobCount.mockResolvedValue(0)
  m.jobFindMany.mockResolvedValue([])
  m.postGroupBy.mockResolvedValue([])
  m.transactionQueryRaw.mockResolvedValue([])
  const transactionClient = {
    operatorPostJob: {
      count: m.jobCount,
      findMany: m.jobFindMany,
      createManyAndReturn: m.jobCreateManyAndReturn,
    },
    post: { groupBy: m.postGroupBy },
    $queryRaw: m.transactionQueryRaw,
  }
  m.transaction.mockImplementation(async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient))
  m.jobCreateManyAndReturn.mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) =>
    data.map((row, index) => ({
      id: `job_${index + 1}`,
      clientPostId: row.clientPostId,
      operatorUserId: row.operatorUserId,
      publishAt: row.publishAt,
    })),
  )
  m.audit.mockResolvedValue(undefined)
})

describe('createOperatorPostBatch — validation', () => {
  it.each([
    ['a user who is not an operator', { operatorUserId: 'user_1', text: 'hi' }, 'not_operator'],
    ['a missing operator id', { text: 'hi' }, 'not_operator'],
    ['a retired operator', { operatorUserId: 'op_off', text: 'hi' }, 'operator_inactive'],
    ['a moderation-restricted operator', { operatorUserId: 'op_ban', text: 'hi' }, 'account_restricted'],
    ['an image key minted for another operator', { operatorUserId: 'op_1', imageObjectKey: KEY_OP2 }, 'invalid_image_key'],
    ['a conversation image key', { operatorUserId: 'op_1', imageObjectKey: 'conversations/c1/x.jpg' }, 'invalid_image_key'],
    ['text over 1000 characters', { operatorUserId: 'op_1', text: 'a'.repeat(1001) }, 'text_too_long'],
    ['whitespace-only text and no image', { operatorUserId: 'op_1', text: '  \n ' }, 'text_or_image_required'],
    ['no text and no image', { operatorUserId: 'op_1' }, 'text_or_image_required'],
    ['a background outside the catalog', { operatorUserId: 'op_1', text: 'hi', backgroundKey: 'neon' }, 'invalid_background'],
    ['an unparseable publish time', { operatorUserId: 'op_1', text: 'hi', publishAt: 'tomorrow' }, 'invalid_publish_at'],
    ['a publish time long past', { operatorUserId: 'op_1', text: 'hi', publishAt: '2026-10-01T02:00:00.000Z' }, 'publish_at_past'],
    ['a publish time over 30 days ahead', { operatorUserId: 'op_1', text: 'hi', publishAt: '2026-11-15T00:00:00.000Z' }, 'publish_at_too_far'],
    ['a text that is not a string', { operatorUserId: 'op_1', text: 42 }, 'invalid_item'],
  ])('refuses %s', async (_label, item, reason) => {
    const result = await create([item])
    expect(result).toMatchObject({ ok: true, batchId: null, queued: 0, invalid: 1, items: [{ index: 0, state: 'invalid', reason }] })
    expect(m.jobCreateManyAndReturn).not.toHaveBeenCalled()
    expect(m.audit).not.toHaveBeenCalled()
  })

  it('refuses a non-object item', async () => {
    const result = await create(['text'])
    expect(result).toMatchObject({ ok: true, items: [{ index: 0, state: 'invalid', reason: 'invalid_item' }] })
  })

  it('accepts exactly 1000 characters and an image the operator owns', async () => {
    const result = await create([
      { operatorUserId: 'op_1', text: 'a'.repeat(1000) },
      { operatorUserId: 'op_1', imageObjectKey: KEY_OP1, imageWidth: 1200, imageHeight: 900 },
    ])
    expect(result).toMatchObject({ ok: true, queued: 2, invalid: 0 })
    expect(insertedRows()[1]).toMatchObject({ imageObjectKey: KEY_OP1, imageWidth: 1200, imageHeight: 900, text: null })
  })

  it('refuses an empty or oversized batch before touching the database', async () => {
    await expect(create([])).resolves.toEqual({ ok: false, error: 'no_items' })
    await expect(create('nope')).resolves.toEqual({ ok: false, error: 'no_items' })
    const tooMany = Array.from({ length: 101 }, () => ({ operatorUserId: 'op_1', text: 'hi' }))
    await expect(create(tooMany)).resolves.toEqual({ ok: false, error: 'too_many_items', limit: 100 })
    expect(m.userFindFirst).not.toHaveBeenCalled()
  })

  it('checks each operator once per batch', async () => {
    await create([
      { operatorUserId: 'op_1', text: 'a' },
      { operatorUserId: 'op_1', text: 'b' },
      { operatorUserId: 'op_2', text: 'c' },
    ])
    expect(m.userFindFirst).toHaveBeenCalledTimes(2)
  })
})

describe('createOperatorPostBatch — queuing', () => {
  it('queues valid items, reports invalid ones by index, and writes nothing for them', async () => {
    const result = await create([
      { operatorUserId: 'op_1', text: 'Olá!', backgroundKey: 'ocean-blue' },
      { operatorUserId: 'user_1', text: 'nope' },
      { operatorUserId: 'op_2', text: 'こんにちは' },
    ])
    if (!result.ok) throw new Error('expected ok')
    expect(result.queued).toBe(2)
    expect(result.items.map((item) => [item.index, item.state])).toEqual([
      [0, 'queued'],
      [1, 'invalid'],
      [2, 'queued'],
    ])
    const rows = insertedRows()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      batchId: result.batchId,
      operatorUserId: 'op_1',
      text: 'Olá!',
      backgroundKey: 'ocean-blue',
      state: 'queued',
      createdBySessionId: 'admin_sess_1',
    })
    expect(rows.map((row) => row.clientPostId)).toEqual([`op-${result.batchId}-1`, `op-${result.batchId}-3`])
  })

  it('mints clientPostIds publishPost accepts as the post id', async () => {
    const result = await create([{ operatorUserId: 'op_1', text: 'hi' }])
    if (!result.ok) throw new Error('expected ok')
    expect(result.batchId).toMatch(/^[0-9a-f]{16}$/)
    const clientPostId = String(insertedRows()[0].clientPostId)
    expect(CLIENT_POST_ID_PATTERN.test(clientPostId)).toBe(true)
    expect(operatorPostItemNumber(clientPostId)).toBe(1)
  })

  it('refuses the whole batch when it would push the queue past 500', async () => {
    m.jobCount.mockResolvedValue(498)
    const result = await create([
      { operatorUserId: 'op_1', text: 'a' },
      { operatorUserId: 'op_1', text: 'b' },
      { operatorUserId: 'op_1', text: 'c' },
    ])
    expect(result).toEqual({ ok: false, error: 'queue_full', limit: 500, waiting: 498 })
    expect(m.jobCount).toHaveBeenCalledWith({ where: { state: { in: ['queued', 'publishing'] } } })
    expect(m.transactionQueryRaw).toHaveBeenCalledOnce()
    expect(m.jobCreateManyAndReturn).not.toHaveBeenCalled()
  })

  it('reserves the queue and schedule snapshot inside one serialized transaction', async () => {
    const result = await create([{ operatorUserId: 'op_1', text: 'a' }])
    expect(result.ok).toBe(true)
    expect(m.transaction).toHaveBeenCalledOnce()
    expect(m.transactionQueryRaw).toHaveBeenCalledOnce()
    const [strings] = m.transactionQueryRaw.mock.calls[0] as [TemplateStringsArray]
    const lockQuery = Prisma.sql(strings)
    expect(lockQuery.sql).toContain('pg_advisory_xact_lock(7315305107985148720)::text')
    expect(m.jobCount).toHaveBeenCalledOnce()
    expect(m.jobCreateManyAndReturn).toHaveBeenCalledOnce()
  })

  it('publishes "바로 게시" items now and marks the batch due', async () => {
    const result = await create([{ operatorUserId: 'op_1', text: 'hi', publishAt: 'now' }])
    expect(result).toMatchObject({ ok: true, hasDueItems: true })
    expect(insertedRows()[0].publishAt).toEqual(NOW)
  })

  it('treats a slightly past explicit time as now, and keeps a future one', async () => {
    const future = '2026-10-01T09:30:00.000Z'
    await create([
      { operatorUserId: 'op_1', text: 'a', publishAt: '2026-10-01T02:57:00.000Z' },
      { operatorUserId: 'op_2', text: 'b', publishAt: future },
    ])
    expect(insertedRows().map((row) => (row.publishAt as Date).toISOString())).toEqual([NOW.toISOString(), future])
  })

  it('spreads items without a time, starting about 2 minutes from now, and is not due yet', async () => {
    const result = await create([
      { operatorUserId: 'op_1', text: 'a' },
      { operatorUserId: 'op_2', text: 'b' },
    ])
    expect(result).toMatchObject({ ok: true, hasDueItems: false })
    const [first, second] = insertedRows().map((row) => (row.publishAt as Date).getTime())
    expect(first).toBe(NOW.getTime() + SPREAD_START_DELAY_MS)
    expect(second - first).toBe(3 * 60 * MIN)
  })

  it('keeps the per-operator gap to jobs queued by earlier batches and to the latest post', async () => {
    m.jobFindMany.mockResolvedValue([{ operatorUserId: 'op_1', publishAt: new Date(NOW.getTime() + 5 * MIN) }])
    m.postGroupBy.mockResolvedValue([{ authorId: 'op_1', _max: { publishedAt: new Date(NOW.getTime() - 20 * MIN) } }])
    await create([{ operatorUserId: 'op_1', text: 'a' }])
    expect(m.jobFindMany).toHaveBeenCalledWith({
      where: { operatorUserId: { in: ['op_1'] }, state: { in: ['queued', 'publishing'] } },
      select: { operatorUserId: true, publishAt: true },
    })
    const at = (insertedRows()[0].publishAt as Date).getTime()
    expect(at - (NOW.getTime() + 5 * MIN)).toBeGreaterThanOrEqual(MIN_OPERATOR_GAP_MS)
  })

  it('writes one batch_create audit row per operator with its job ids', async () => {
    const result = await create([
      { operatorUserId: 'op_1', text: 'a' },
      { operatorUserId: 'op_2', text: 'b' },
      { operatorUserId: 'op_1', text: 'c' },
    ])
    if (!result.ok) throw new Error('expected ok')
    expect(m.audit).toHaveBeenCalledTimes(2)
    expect(m.audit).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        action: 'operator_post.batch_create',
        operatorUserId: 'op_1',
        targetType: 'operator_post_batch',
        targetId: result.batchId,
        metadata: expect.objectContaining({ batchId: result.batchId, jobIds: ['job_1', 'job_3'] }),
      }),
    )
    expect(m.audit).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ operatorUserId: 'op_2', metadata: expect.objectContaining({ jobIds: ['job_2'] }) }),
    )
  })
})

describe('cancelOperatorPostJobs', () => {
  it('cancels only still-queued jobs in one atomic UPDATE and audits per operator', async () => {
    m.queryRaw.mockResolvedValue([
      { id: 'job_1', operatorUserId: 'op_1', batchId: 'batch_1' },
      { id: 'job_2', operatorUserId: 'op_1', batchId: 'batch_1' },
    ])
    const result = await cancelOperatorPostJobs(ctx, ['job_1', 'job_2', 'job_1', '', 7], { batchId: 'batch_1', now: NOW })
    expect(result.cancelled).toHaveLength(2)
    const query = rawQuery()
    expect(query.sql).toContain("SET state = 'cancelled'")
    expect(query.sql).toContain("AND state = 'queued'")
    expect(query.sql).toContain('AND batch_id = ')
    expect(query.sql).toContain('RETURNING')
    expect(query.values).toEqual(expect.arrayContaining(['job_1', 'job_2', 'batch_1', NOW.toISOString()]))
    expect(query.values.filter((value) => value === 'job_1')).toHaveLength(1)
    expect(m.audit).toHaveBeenCalledOnce()
    expect(m.audit).toHaveBeenCalledWith(ctx, {
      action: 'operator_post.cancel',
      operatorUserId: 'op_1',
      targetType: 'operator_post_batch',
      targetId: 'batch_1',
      metadata: { batchIds: ['batch_1'], jobIds: ['job_1', 'job_2'] },
    })
  })

  it('does nothing without ids and audits nothing when no job was still queued', async () => {
    await expect(cancelOperatorPostJobs(ctx, [])).resolves.toEqual({ cancelled: [] })
    expect(m.queryRaw).not.toHaveBeenCalled()
    m.queryRaw.mockResolvedValue([])
    await expect(cancelOperatorPostJobs(ctx, ['job_9'])).resolves.toEqual({ cancelled: [] })
    expect(rawQuery().sql).not.toContain('batch_id =')
    expect(m.audit).not.toHaveBeenCalled()
  })
})

describe('read models', () => {
  const identity = { id: 'op_1', handle: 'lucas', name: 'Lucas', image: null, primaryLanguages: ['pt'] }

  it('returns a batch in publish order with item numbers and operator identities', async () => {
    m.jobFindMany.mockResolvedValue([
      {
        id: 'job_2',
        clientPostId: 'op-abc-2',
        operatorUserId: 'op_1',
        text: 'b',
        imageObjectKey: null,
        backgroundKey: null,
        publishAt: new Date('2026-10-01T04:00:00Z'),
        state: 'queued',
        postId: null,
        error: null,
        attempts: 0,
        createdAt: new Date('2026-10-01T03:00:00Z'),
        updatedAt: new Date('2026-10-01T03:00:00Z'),
      },
      {
        id: 'job_1',
        clientPostId: 'op-abc-1',
        operatorUserId: 'op_1',
        text: 'a',
        imageObjectKey: null,
        backgroundKey: 'ocean-blue',
        publishAt: new Date('2026-10-01T03:02:00Z'),
        state: 'published',
        postId: 'op-abc-1',
        error: null,
        attempts: 1,
        createdAt: new Date('2026-10-01T02:59:00Z'),
        updatedAt: new Date('2026-10-01T03:02:10Z'),
      },
    ])
    m.userFindMany.mockResolvedValue([identity])
    const batch = await getOperatorPostBatch('abc')
    expect(batch?.createdAt).toBe('2026-10-01T02:59:00.000Z')
    expect(batch?.items.map((item) => [item.index, item.state, item.postId])).toEqual([
      [1, 'published', 'op-abc-1'],
      [2, 'queued', null],
    ])
    expect(batch?.items[0].operator).toEqual({ id: 'op_1', handle: 'lucas', name: 'Lucas', image: null, language: 'pt' })
  })

  it('returns null for an unknown batch', async () => {
    m.jobFindMany.mockResolvedValue([])
    await expect(getOperatorPostBatch('nope')).resolves.toBeNull()
    await expect(getOperatorPostBatch('')).resolves.toBeNull()
  })

  it('summarizes recent batches with per-state counts and their operators', async () => {
    m.jobGroupBy
      .mockResolvedValueOnce([
        {
          batchId: 'b1',
          _count: { _all: 3 },
          _min: { createdAt: new Date('2026-10-01T03:00:00Z'), publishAt: new Date('2026-10-01T03:02:00Z') },
          _max: { publishAt: new Date('2026-10-01T08:00:00Z') },
        },
      ])
      .mockResolvedValueOnce([
        { batchId: 'b1', state: 'queued', _count: { _all: 2 } },
        { batchId: 'b1', state: 'published', _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([{ batchId: 'b1', operatorUserId: 'op_1', _min: { publishAt: new Date() } }])
    m.userFindMany.mockResolvedValue([identity])
    const [summary] = await listRecentOperatorPostBatches()
    expect(summary).toMatchObject({
      batchId: 'b1',
      total: 3,
      counts: { queued: 2, published: 1 },
      firstPublishAt: '2026-10-01T03:02:00.000Z',
      lastPublishAt: '2026-10-01T08:00:00.000Z',
      operatorCount: 1,
      operators: [{ id: 'op_1', language: 'pt' }],
    })
  })
})
