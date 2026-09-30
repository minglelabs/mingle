/**
 * Operator post jobs: the admin side of bulk posting as operator accounts.
 *
 * A job row is a post that does not exist yet. It keeps everything
 * `publishPost` needs; the worker (./worker.ts) calls the unchanged
 * `publishPost` when the job is due, so the post row — and with it every
 * public read path — only appears at its real publish time (contract §5).
 */
import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isKnownBackgroundKey } from '@/lib/post-backgrounds'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { parseImageDimensions } from '@/server/posts/post-image-dimensions'
import { isOwnedPostImageKey } from '@/server/posts/post-image-keys'
import { POST_BODY_MAX_LENGTH } from '@/server/posts/publish-post'
import { checkOperatorForPosting, personaLanguageOf, type OperatorPostingCheck } from './operator-check'
import { planPublishTimes, type PublishRequest } from './schedule'
import { sqlUtcTimestamp } from './sql'
import {
  OPERATOR_POST_BATCH_MAX_ITEMS,
  OPERATOR_POST_PUBLISH_NOW,
  OPERATOR_POST_QUEUE_MAX,
  type OperatorPostBatchDetail,
  type OperatorPostBatchSummary,
  type OperatorPostIdentity,
  type OperatorPostInvalidReason,
  type OperatorPostItemResult,
  type OperatorPostJobDto,
  type OperatorPostJobState,
} from './types'

/** An explicit time this far in the past is refused; less is treated as "now" (phone clocks drift). */
export const PUBLISH_AT_PAST_TOLERANCE_MS = 5 * 60_000
/** Farthest an explicit time may be scheduled ahead. */
export const PUBLISH_AT_MAX_AHEAD_MS = 30 * 24 * 60 * 60_000

const WAITING_STATES: OperatorPostJobState[] = ['queued', 'publishing']
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

type ParsedItem = {
  index: number
  operatorUserId: string
  text: string | null
  imageObjectKey: string | null
  imageWidth: number | null
  imageHeight: number | null
  backgroundKey: string | null
  request: PublishRequest
}

type Invalid = { index: number; reason: OperatorPostInvalidReason }

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

export function parsePublishRequest(
  value: unknown,
  now: Date,
): PublishRequest | 'invalid_publish_at' | 'publish_at_past' | 'publish_at_too_far' {
  if (!isPresent(value)) return { kind: 'spread' }
  if (value === OPERATOR_POST_PUBLISH_NOW) return { kind: 'now' }
  if (typeof value !== 'string' || !ISO_DATE_TIME.test(value)) return 'invalid_publish_at'
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return 'invalid_publish_at'
  if (at.getTime() < now.getTime() - PUBLISH_AT_PAST_TOLERANCE_MS) return 'publish_at_past'
  if (at.getTime() > now.getTime() + PUBLISH_AT_MAX_AHEAD_MS) return 'publish_at_too_far'
  return { kind: 'at', at: at.getTime() < now.getTime() ? now : at }
}

/** Shape checks that need no database. */
function parseItem(raw: unknown, index: number, now: Date): ParsedItem | Invalid {
  const invalid = (reason: OperatorPostInvalidReason): Invalid => ({ index, reason })
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('invalid_item')
  const item = raw as Record<string, unknown>

  const operatorUserId = typeof item.operatorUserId === 'string' ? item.operatorUserId.trim() : ''
  if (!operatorUserId) return invalid('not_operator')

  if (isPresent(item.text) && typeof item.text !== 'string') return invalid('invalid_item')
  const rawText = typeof item.text === 'string' ? item.text : null
  if (rawText !== null && rawText.length > POST_BODY_MAX_LENGTH) return invalid('text_too_long')
  const text = rawText !== null && rawText.trim() ? rawText : null

  let imageObjectKey: string | null = null
  if (isPresent(item.imageObjectKey)) {
    // Keys are minted per uploader: only one issued for THIS operator can be posted by it.
    if (!isOwnedPostImageKey(item.imageObjectKey, operatorUserId)) return invalid('invalid_image_key')
    imageObjectKey = item.imageObjectKey
  }
  if (!text && !imageObjectKey) return invalid('text_or_image_required')
  const dimensions = imageObjectKey ? parseImageDimensions(item) : null

  let backgroundKey: string | null = null
  if (isPresent(item.backgroundKey)) {
    if (typeof item.backgroundKey !== 'string' || !isKnownBackgroundKey(item.backgroundKey)) {
      return invalid('invalid_background')
    }
    backgroundKey = item.backgroundKey
  }

  const request = parsePublishRequest(item.publishAt, now)
  if (typeof request === 'string') return invalid(request)

  return {
    index,
    operatorUserId,
    text,
    imageObjectKey,
    imageWidth: dimensions?.imageWidth ?? null,
    imageHeight: dimensions?.imageHeight ?? null,
    backgroundKey,
    request,
  }
}

function isInvalid(value: ParsedItem | Invalid): value is Invalid {
  return 'reason' in value
}

/** 16 hex chars; `op-<batchId>-<n>` then satisfies publishPost's clientPostId rule. */
function newBatchId(): string {
  return randomBytes(8).toString('hex')
}

export function operatorPostClientPostId(batchId: string, index: number): string {
  return `op-${batchId}-${index + 1}`
}

/** The 1-based item number encoded in a clientPostId (`op-<batchId>-<n>`), or 0. */
export function operatorPostItemNumber(clientPostId: string): number {
  const match = /-(\d+)$/.exec(clientPostId)
  return match ? Number(match[1]) : 0
}

type OperatorPostTransaction = Pick<Prisma.TransactionClient, 'operatorPostJob' | 'post'>

/** Times the operators already post at, for the spread schedule's per-operator gap. */
async function loadScheduleAnchors(
  db: OperatorPostTransaction,
  operatorUserIds: string[],
): Promise<Array<{ operatorUserId: string; at: Date }>> {
  if (operatorUserIds.length === 0) return []
  const [jobs, latestPosts] = await Promise.all([
    db.operatorPostJob.findMany({
      where: { operatorUserId: { in: operatorUserIds }, state: { in: WAITING_STATES } },
      select: { operatorUserId: true, publishAt: true },
    }),
    db.post.groupBy({
      by: ['authorId'],
      where: { authorId: { in: operatorUserIds } },
      _max: { publishedAt: true },
    }),
  ])
  return [
    ...jobs.map((job) => ({ operatorUserId: job.operatorUserId, at: job.publishAt })),
    ...latestPosts.flatMap((row) =>
      row._max.publishedAt ? [{ operatorUserId: row.authorId, at: row._max.publishedAt }] : [],
    ),
  ]
}

export type CreateOperatorPostBatchResult =
  | {
      ok: true
      batchId: string | null
      queued: number
      invalid: number
      items: OperatorPostItemResult[]
      /** Some queued job is already due: kick the worker instead of waiting for its tick. */
      hasDueItems: boolean
    }
  | { ok: false; error: 'no_items' }
  | { ok: false; error: 'too_many_items'; limit: number }
  | { ok: false; error: 'queue_full'; limit: number; waiting: number }

/**
 * Validate and queue a batch of operator posts. Per item: an operator account
 * (`requireOperatorAccount`), active, not moderation-restricted, text <= 1000
 * characters, text or image, an image key issued to that operator, a catalog
 * background, and a sane publish time. Valid items are queued; invalid ones
 * come back with the reason and nothing is written for them.
 */
export async function createOperatorPostBatch(
  ctx: AdminContext,
  items: unknown,
  options: { now?: Date; random?: () => number } = {},
): Promise<CreateOperatorPostBatchResult> {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'no_items' }
  if (items.length > OPERATOR_POST_BATCH_MAX_ITEMS) {
    return { ok: false, error: 'too_many_items', limit: OPERATOR_POST_BATCH_MAX_ITEMS }
  }
  const now = options.now ?? new Date()

  const parsed = items.map((raw, index) => parseItem(raw, index, now))
  const checks = new Map<string, Promise<OperatorPostingCheck>>()
  const checkOnce = (operatorUserId: string) => {
    let check = checks.get(operatorUserId)
    if (!check) {
      check = checkOperatorForPosting(operatorUserId)
      checks.set(operatorUserId, check)
    }
    return check
  }
  const results = await Promise.all(
    parsed.map(async (item): Promise<ParsedItem | Invalid> => {
      if (isInvalid(item)) return item
      const check = await checkOnce(item.operatorUserId)
      return check.ok ? item : { index: item.index, reason: check.reason }
    }),
  )

  const invalid = results.filter(isInvalid)
  const valid = results.filter((item): item is ParsedItem => !isInvalid(item))
  if (valid.length === 0) {
    return {
      ok: true,
      batchId: null,
      queued: 0,
      invalid: invalid.length,
      items: invalid.map((item) => ({ index: item.index, state: 'invalid', reason: item.reason })),
      hasDueItems: false,
    }
  }

  const spreadOperators = [
    ...new Set(valid.filter((item) => item.request.kind === 'spread').map((item) => item.operatorUserId)),
  ]
  const batchId = newBatchId()
  const insertion = await prisma.$transaction(async (tx) => {
    // Serialize batch reservations so simultaneous requests cannot exceed the
    // global queue cap or plan the same operator's spread slots from stale data.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(7315305107985148720)`

    const waiting = await tx.operatorPostJob.count({ where: { state: { in: WAITING_STATES } } })
    if (waiting + valid.length > OPERATOR_POST_QUEUE_MAX) return { ok: false as const, waiting }

    const times = planPublishTimes({
      now,
      items: valid.map((item) => ({ operatorUserId: item.operatorUserId, request: item.request })),
      anchors: await loadScheduleAnchors(tx, spreadOperators),
      random: options.random,
    })
    const created = await tx.operatorPostJob.createManyAndReturn({
      data: valid.map((item, position) => ({
        batchId,
        operatorUserId: item.operatorUserId,
        clientPostId: operatorPostClientPostId(batchId, item.index),
        text: item.text,
        imageObjectKey: item.imageObjectKey,
        imageWidth: item.imageWidth,
        imageHeight: item.imageHeight,
        backgroundKey: item.backgroundKey,
        publishAt: times[position],
        state: 'queued',
        createdBySessionId: ctx.sessionId,
      })),
      select: { id: true, clientPostId: true, operatorUserId: true, publishAt: true },
    })
    return { ok: true as const, created }
  })
  if (!insertion.ok) {
    return { ok: false, error: 'queue_full', limit: OPERATOR_POST_QUEUE_MAX, waiting: insertion.waiting }
  }
  const { created } = insertion
  const createdByClientPostId = new Map(created.map((job) => [job.clientPostId, job]))

  const queuedItems: OperatorPostItemResult[] = []
  for (const item of valid) {
    const job = createdByClientPostId.get(operatorPostClientPostId(batchId, item.index))
    if (!job) continue
    queuedItems.push({
      index: item.index,
      state: 'queued',
      jobId: job.id,
      clientPostId: job.clientPostId,
      publishAt: job.publishAt.toISOString(),
    })
  }

  // One audit row per operator, so "what was done as operator X" is one indexed lookup.
  const jobsByOperator = new Map<string, typeof created>()
  for (const job of created) {
    const list = jobsByOperator.get(job.operatorUserId)
    if (list) list.push(job)
    else jobsByOperator.set(job.operatorUserId, [job])
  }
  await Promise.all(
    [...jobsByOperator].map(([operatorUserId, jobs]) => {
      const publishTimes = jobs.map((job) => job.publishAt.getTime())
      return writeAdminAudit(ctx, {
        action: 'operator_post.batch_create',
        operatorUserId,
        targetType: 'operator_post_batch',
        targetId: batchId,
        metadata: {
          batchId,
          jobIds: jobs.map((job) => job.id),
          firstPublishAt: new Date(Math.min(...publishTimes)).toISOString(),
          lastPublishAt: new Date(Math.max(...publishTimes)).toISOString(),
        },
      })
    }),
  )

  const itemResults = [
    ...queuedItems,
    ...invalid.map((item): OperatorPostItemResult => ({ index: item.index, state: 'invalid', reason: item.reason })),
  ].sort((a, b) => a.index - b.index)

  return {
    ok: true,
    batchId,
    queued: queuedItems.length,
    invalid: invalid.length,
    items: itemResults,
    hasDueItems: created.some((job) => job.publishAt.getTime() <= now.getTime()),
  }
}

/**
 * Cancel jobs that are still queued (a job already publishing or done is left
 * alone). One atomic UPDATE, so a job the worker claims meanwhile is never
 * reported as cancelled. `batchId` limits the cancel to one batch.
 */
export async function cancelOperatorPostJobs(
  ctx: AdminContext,
  ids: readonly unknown[],
  options: { batchId?: string; now?: Date } = {},
): Promise<{ cancelled: Array<{ id: string; operatorUserId: string; batchId: string }> }> {
  const unique = [
    ...new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim())),
  ].slice(0, OPERATOR_POST_QUEUE_MAX)
  if (unique.length === 0) return { cancelled: [] }
  const now = options.now ?? new Date()

  const cancelled = await prisma.$queryRaw<Array<{ id: string; operatorUserId: string; batchId: string }>>`
    UPDATE app_operator_post_jobs
    SET state = 'cancelled', updated_at = ${sqlUtcTimestamp(now)}
    WHERE id IN (${Prisma.join(unique)})
      AND state = 'queued'
      ${options.batchId ? Prisma.sql`AND batch_id = ${options.batchId}` : Prisma.empty}
    RETURNING id, operator_user_id AS "operatorUserId", batch_id AS "batchId"
  `

  const byOperator = new Map<string, typeof cancelled>()
  for (const job of cancelled) {
    const list = byOperator.get(job.operatorUserId)
    if (list) list.push(job)
    else byOperator.set(job.operatorUserId, [job])
  }
  await Promise.all(
    [...byOperator].map(([operatorUserId, jobs]) =>
      writeAdminAudit(ctx, {
        action: 'operator_post.cancel',
        operatorUserId,
        targetType: 'operator_post_batch',
        targetId: jobs[0].batchId,
        metadata: { batchIds: [...new Set(jobs.map((job) => job.batchId))], jobIds: jobs.map((job) => job.id) },
      }),
    ),
  )
  return { cancelled }
}

/** Ids of the batch's jobs that are still queued ("모두 취소"). */
export async function listQueuedJobIds(batchId: string): Promise<string[]> {
  const jobs = await prisma.operatorPostJob.findMany({
    where: { batchId, state: 'queued' },
    select: { id: true },
    take: OPERATOR_POST_BATCH_MAX_ITEMS,
  })
  return jobs.map((job) => job.id)
}

async function loadOperatorIdentities(ids: string[]): Promise<Map<string, OperatorPostIdentity>> {
  if (ids.length === 0) return new Map()
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, handle: true, name: true, image: true, primaryLanguages: true },
  })
  return new Map(
    users.map((user) => [
      user.id,
      { id: user.id, handle: user.handle, name: user.name, image: user.image, language: personaLanguageOf(user) },
    ]),
  )
}

function toState(value: string): OperatorPostJobState {
  switch (value) {
    case 'queued':
    case 'publishing':
    case 'published':
    case 'duplicate':
    case 'conflict':
    case 'failed':
    case 'cancelled':
      return value
    default:
      return 'failed'
  }
}

/** Every job of one batch, in publish order, or null when the batch does not exist. */
export async function getOperatorPostBatch(batchId: string): Promise<OperatorPostBatchDetail | null> {
  if (!batchId) return null
  const jobs = await prisma.operatorPostJob.findMany({
    where: { batchId },
    select: {
      id: true,
      clientPostId: true,
      operatorUserId: true,
      text: true,
      imageObjectKey: true,
      backgroundKey: true,
      publishAt: true,
      state: true,
      postId: true,
      error: true,
      attempts: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ publishAt: 'asc' }, { createdAt: 'asc' }],
    take: OPERATOR_POST_BATCH_MAX_ITEMS,
  })
  if (jobs.length === 0) return null
  const identities = await loadOperatorIdentities([...new Set(jobs.map((job) => job.operatorUserId))])

  const items: OperatorPostJobDto[] = jobs
    .map((job) => ({
      id: job.id,
      index: operatorPostItemNumber(job.clientPostId),
      clientPostId: job.clientPostId,
      operator: identities.get(job.operatorUserId) ?? null,
      text: job.text,
      imageObjectKey: job.imageObjectKey,
      backgroundKey: job.backgroundKey,
      publishAt: job.publishAt.toISOString(),
      state: toState(job.state),
      postId: job.postId,
      error: job.error,
      attempts: job.attempts,
      updatedAt: job.updatedAt.toISOString(),
    }))
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt) || a.index - b.index)

  const createdAt = new Date(Math.min(...jobs.map((job) => job.createdAt.getTime())))
  return { batchId, createdAt: createdAt.toISOString(), items }
}

/** The newest batches with per-state counts, newest first. */
export async function listRecentOperatorPostBatches(options: { limit?: number } = {}): Promise<OperatorPostBatchSummary[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
  const groups = await prisma.operatorPostJob.groupBy({
    by: ['batchId'],
    _count: { _all: true },
    _min: { createdAt: true, publishAt: true },
    _max: { publishAt: true },
    orderBy: { _min: { createdAt: 'desc' } },
    take: limit,
  })
  if (groups.length === 0) return []
  const batchIds = groups.map((group) => group.batchId)

  const [stateGroups, operatorGroups] = await Promise.all([
    prisma.operatorPostJob.groupBy({
      by: ['batchId', 'state'],
      where: { batchId: { in: batchIds } },
      _count: { _all: true },
    }),
    prisma.operatorPostJob.groupBy({
      by: ['batchId', 'operatorUserId'],
      where: { batchId: { in: batchIds } },
      _min: { publishAt: true },
      orderBy: { _min: { publishAt: 'asc' } },
    }),
  ])
  const identities = await loadOperatorIdentities([...new Set(operatorGroups.map((row) => row.operatorUserId))])

  return groups.map((group) => {
    const counts: Partial<Record<OperatorPostJobState, number>> = {}
    for (const row of stateGroups) {
      if (row.batchId !== group.batchId) continue
      const state = toState(row.state)
      counts[state] = (counts[state] ?? 0) + row._count._all
    }
    const operatorIds = operatorGroups.filter((row) => row.batchId === group.batchId).map((row) => row.operatorUserId)
    return {
      batchId: group.batchId,
      createdAt: (group._min.createdAt ?? new Date(0)).toISOString(),
      total: group._count._all,
      counts,
      firstPublishAt: (group._min.publishAt ?? new Date(0)).toISOString(),
      lastPublishAt: (group._max.publishAt ?? new Date(0)).toISOString(),
      operators: operatorIds
        .slice(0, 5)
        .flatMap((id) => {
          const identity = identities.get(id)
          return identity ? [identity] : []
        }),
      operatorCount: operatorIds.length,
    }
  })
}
