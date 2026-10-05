import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sanitizeSttLanguageSelection } from '@/lib/stt-languages'
import { writeAdminAudit } from '@/server/admin/audit'
import { ageOn } from '@/server/operator-auto-reply/generate'
import { checkOperatorForPosting, personaLanguageOf } from '@/server/operator-posts/operator-check'
import { sqlUtcTimestamp } from '@/server/operator-posts/sql'
import { publishPost } from '@/server/posts/publish-post'
import { generateReservePosts, pickReserveTopics, reservePosterProfile, RESERVE_CHUNK_SIZE } from './generate'
import { nextReleaseAt } from './schedule'
import { getPostReserveSettings, postsPerDay, type PostReserveSettings } from './settings'

/**
 * Keeps every active operator account posting on its own: a reserve of
 * pre-written posts per account, of which a small share goes out each day.
 *
 * One run does three things, in order:
 * 1. release: publish reserve posts whose `release_at` has come, through the
 *    unchanged `publishPost` (the row id is the client post id, so a retried
 *    publish is a duplicate, never a second post);
 * 2. schedule: give every account that has waiting posts but none scheduled
 *    its next `release_at` (see ./schedule.ts);
 * 3. refill: for a few accounts below the target, write one chunk of new
 *    posts with the model.
 * All of it only while the staff setting is on.
 */
export const RESERVE_MAX_RELEASES_PER_RUN = 40
export const RESERVE_REFILL_ACCOUNTS_PER_RUN = 3
export const RESERVE_MAX_ATTEMPTS = 3
export const RESERVE_STALE_PUBLISHING_MS = 10 * 60_000
const EXISTING_TEXT_SAMPLE = 80
const MAX_ERROR_LENGTH = 300

export type ReserveRunSummary = {
  enabled: boolean
  released: number
  releaseFailed: number
  scheduled: number
  refilledAccounts: number
  generated: number
}

type ClaimedReservePost = { id: string; operatorUserId: string; text: string; attempts: number }

function describeError(error: unknown): string {
  return (error instanceof Error ? `${error.name}: ${error.message}` : 'unknown_error').slice(0, MAX_ERROR_LENGTH)
}

/** `rs-<id>`: the post's client id, stable across retries. */
export function reserveClientPostId(reserveId: string): string {
  return `rs-${reserveId}`
}

async function claimDueReservePosts(now: Date, limit: number): Promise<ClaimedReservePost[]> {
  return prisma.$queryRaw<ClaimedReservePost[]>`
    UPDATE app_operator_post_reserve
    SET state = 'publishing', attempts = attempts + 1, updated_at = ${sqlUtcTimestamp(now)}
    WHERE id IN (
      SELECT id FROM app_operator_post_reserve
      WHERE state = 'queued' AND release_at IS NOT NULL AND release_at <= ${sqlUtcTimestamp(now)}
      ORDER BY release_at ASC, id ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, operator_user_id AS "operatorUserId", text, attempts
  `
}

/** Publish one claimed reserve post and record the result. Never throws. */
async function releaseOne(row: ClaimedReservePost, now: Date): Promise<boolean> {
  const settle = (data: Prisma.OperatorPostReserveUpdateManyMutationInput) =>
    prisma.operatorPostReserve.updateMany({ where: { id: row.id, state: 'publishing', attempts: row.attempts }, data })
  try {
    // Acting as the operator: re-check the account at publish time.
    const check = await checkOperatorForPosting(row.operatorUserId)
    if (!check.ok) {
      await settle({ state: 'failed', error: check.reason, releaseAt: null })
      return false
    }
    const result = await publishPost({
      authorId: row.operatorUserId,
      text: row.text,
      imageObjectKey: null,
      clientHint: personaLanguageOf(check.account),
      clientPostId: reserveClientPostId(row.id),
    })
    if (result.kind === 'conflict') {
      await settle({ state: 'failed', error: 'client_post_id_conflict', releaseAt: null })
      return false
    }
    await settle({ state: 'published', postId: result.post.id, error: null })
    await writeAdminAudit(null, {
      action: 'operator_post.reserve_published',
      operatorUserId: row.operatorUserId,
      targetType: 'post',
      targetId: result.post.id,
      metadata: { reserveId: row.id, result: result.kind },
    })
    return true
  } catch (error) {
    try {
      await settle(row.attempts >= RESERVE_MAX_ATTEMPTS
        ? { state: 'failed', error: describeError(error), releaseAt: null }
        // Back in line; retried a few minutes later.
        : { state: 'queued', error: describeError(error), releaseAt: new Date(now.getTime() + row.attempts * 5 * 60_000) })
    } catch {
      // Stays `publishing`; requeued as stale by a later run.
    }
    return false
  }
}

/** `publishing` rows left behind by a process that died mid-publish go back in line. */
async function requeueStale(now: Date): Promise<void> {
  await prisma.operatorPostReserve.updateMany({
    where: { state: 'publishing', updatedAt: { lt: new Date(now.getTime() - RESERVE_STALE_PUBLISHING_MS) } },
    data: { state: 'queued', error: 'publish_interrupted', releaseAt: now },
  })
}

type UnscheduledOperator = { operatorUserId: string; personaCountry: string | null; lastAt: Date | null; headId: string }

/**
 * Active operator accounts with waiting reserve posts but no scheduled one,
 * each with its oldest waiting post and the time of its latest post.
 */
async function findUnscheduledOperators(): Promise<UnscheduledOperator[]> {
  return prisma.$queryRaw<UnscheduledOperator[]>`
    SELECT
      waiting.operator_user_id AS "operatorUserId",
      account.persona_country AS "personaCountry",
      (SELECT MAX(post.published_at) FROM app_posts AS post WHERE post.author_id = waiting.operator_user_id) AS "lastAt",
      (
        SELECT head.id FROM app_operator_post_reserve AS head
        WHERE head.operator_user_id = waiting.operator_user_id AND head.state = 'queued'
        ORDER BY head.created_at ASC, head.id ASC
        LIMIT 1
      ) AS "headId"
    FROM (
      SELECT operator_user_id
      FROM app_operator_post_reserve
      WHERE state IN ('queued', 'publishing')
      GROUP BY operator_user_id
      HAVING COUNT(*) FILTER (WHERE release_at IS NOT NULL) = 0
    ) AS waiting
    JOIN app_users AS operator_user
      ON operator_user.id = waiting.operator_user_id
      AND operator_user.is_operator = true
      AND operator_user.is_deleted = false
      AND operator_user.is_active = true
    LEFT JOIN app_operator_accounts AS account ON account.user_id = waiting.operator_user_id
  `
}

async function scheduleHeads(now: Date, settings: PostReserveSettings, random: () => number): Promise<number> {
  const operators = await findUnscheduledOperators()
  let scheduled = 0
  for (const operator of operators) {
    if (!operator.headId) continue
    const releaseAt = nextReleaseAt({
      now,
      lastAt: operator.lastAt ? new Date(operator.lastAt) : null,
      postsPerDay: postsPerDay(settings),
      personaCountry: operator.personaCountry,
      random,
    })
    const result = await prisma.operatorPostReserve.updateMany({
      where: { id: operator.headId, state: 'queued', releaseAt: null },
      data: { releaseAt },
    })
    scheduled += result.count
  }
  return scheduled
}

type RefillOperator = { operatorUserId: string; waiting: number | bigint }

/** Active operator accounts with room for a whole chunk below the target, emptiest first. */
async function findOperatorsToRefill(target: number, limit: number): Promise<RefillOperator[]> {
  return prisma.$queryRaw<RefillOperator[]>`
    SELECT operator_user.id AS "operatorUserId", COUNT(reserve.id)::int AS waiting
    FROM app_users AS operator_user
    LEFT JOIN app_operator_post_reserve AS reserve
      ON reserve.operator_user_id = operator_user.id AND reserve.state IN ('queued', 'publishing')
    WHERE operator_user.is_operator = true
      AND operator_user.is_deleted = false
      AND operator_user.is_active = true
      AND operator_user.moderation_restricted_at IS NULL
      AND cardinality(operator_user.primary_languages) > 0
    GROUP BY operator_user.id
    HAVING COUNT(reserve.id) <= ${Math.max(0, target - RESERVE_CHUNK_SIZE)}
    ORDER BY COUNT(reserve.id) ASC, operator_user.id ASC
    LIMIT ${limit}
  `
}

/** Write one chunk of latent posts for an account. Returns how many were stored. Never throws. */
export async function refillOperatorReserve(operatorUserId: string, now: Date, random: () => number = Math.random): Promise<number> {
  try {
    const operator = await prisma.user.findFirst({
      where: { id: operatorUserId, isOperator: true, isDeleted: false, isActive: true },
      select: { name: true, bio: true, birthDate: true, locationCity: true, locationCountry: true, primaryLanguages: true },
    })
    const language = operator ? sanitizeSttLanguageSelection(operator.primaryLanguages)[0] : null
    if (!operator || !language) return 0

    const [reserve, posts] = await Promise.all([
      prisma.operatorPostReserve.findMany({
        where: { operatorUserId, state: { in: ['queued', 'publishing', 'published'] } },
        orderBy: { createdAt: 'desc' },
        take: EXISTING_TEXT_SAMPLE,
        select: { text: true },
      }),
      prisma.post.findMany({
        where: { authorId: operatorUserId, OR: [{ isDeleted: null }, { isDeleted: false }] },
        orderBy: { publishedAt: 'desc' },
        take: 20,
        select: { sourceText: true },
      }),
    ])
    const existingTexts = [
      ...posts.map((post) => post.sourceText ?? '').filter(Boolean),
      ...reserve.map((row) => row.text),
    ].reverse()

    const generated = await generateReservePosts({
      persona: {
        name: operator.name?.trim() || null,
        bio: operator.bio?.trim() || null,
        age: ageOn(operator.birthDate, now),
        city: operator.locationCity ?? null,
        country: operator.locationCountry ?? null,
        language,
      },
      topics: pickReserveTopics(RESERVE_CHUNK_SIZE, random, reservePosterProfile(operatorUserId).topicFactors),
      existingTexts,
      random,
      seed: operatorUserId,
    })
    if (generated.length === 0) return 0
    const created = await prisma.operatorPostReserve.createMany({
      data: generated.map((post) => ({ operatorUserId, text: post.text, topic: post.topic })),
    })
    return created.count
  } catch (error) {
    console.warn('[operator-post-reserve] refill_failed', {
      operatorUserId,
      error: error instanceof Error ? (error as { code?: string }).code ?? error.name : 'unknown',
    })
    return 0
  }
}

/** One worker run. Does nothing (one settings read) while the reserve is off. */
export async function runOperatorPostReserve(options: { now?: () => Date; random?: () => number } = {}): Promise<ReserveRunSummary> {
  const now = options.now ?? (() => new Date())
  const random = options.random ?? Math.random
  const settings = await getPostReserveSettings()
  const summary: ReserveRunSummary = { enabled: settings.enabled, released: 0, releaseFailed: 0, scheduled: 0, refilledAccounts: 0, generated: 0 }
  if (!settings.enabled) return summary

  await requeueStale(now())
  const due = await claimDueReservePosts(now(), RESERVE_MAX_RELEASES_PER_RUN)
  for (const row of due) {
    if (await releaseOne(row, now())) summary.released += 1
    else summary.releaseFailed += 1
  }
  summary.scheduled = await scheduleHeads(now(), settings, random)

  const toRefill = await findOperatorsToRefill(settings.targetPerOperator, RESERVE_REFILL_ACCOUNTS_PER_RUN)
  const counts = await Promise.all(toRefill.map((operator) => refillOperatorReserve(operator.operatorUserId, now(), random)))
  summary.refilledAccounts = counts.filter((count) => count > 0).length
  summary.generated = counts.reduce((total, count) => total + count, 0)
  return summary
}

/**
 * Manual refill (the "지금 채우기" button): one chunk for up to `limit` accounts
 * below the target, whether or not the automatic rule is on.
 */
export async function refillReserveNow(limit: number = RESERVE_REFILL_ACCOUNTS_PER_RUN, now: Date = new Date()): Promise<{ accounts: number; generated: number }> {
  const settings = await getPostReserveSettings()
  const toRefill = await findOperatorsToRefill(settings.targetPerOperator, Math.max(1, Math.min(10, limit)))
  const counts = await Promise.all(toRefill.map((operator) => refillOperatorReserve(operator.operatorUserId, now)))
  return { accounts: counts.filter((count) => count > 0).length, generated: counts.reduce((total, count) => total + count, 0) }
}

export type PublishNowResult = { ok: true; postId: string | null } | { ok: false; error: 'reserve_empty' | 'publish_failed' }

/**
 * Manual release (the "지금 1개 올리기" button): publishes the account's oldest
 * waiting reserve post right away, whether or not the automatic rule is on.
 */
export async function publishNextReservePost(operatorUserId: string, now: Date = new Date()): Promise<PublishNowResult> {
  const head = await prisma.operatorPostReserve.findFirst({
    where: { operatorUserId, state: 'queued' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  })
  if (!head) return { ok: false, error: 'reserve_empty' }
  // Same atomic claim as the worker, so a tick racing this click cannot publish it twice.
  const claimed = await prisma.$queryRaw<ClaimedReservePost[]>`
    UPDATE app_operator_post_reserve
    SET state = 'publishing', attempts = attempts + 1, updated_at = ${sqlUtcTimestamp(now)}
    WHERE id = ${head.id} AND state = 'queued'
    RETURNING id, operator_user_id AS "operatorUserId", text, attempts
  `
  if (!claimed[0]) return { ok: false, error: 'publish_failed' }
  if (!(await releaseOne(claimed[0], now))) return { ok: false, error: 'publish_failed' }
  const row = await prisma.operatorPostReserve.findUnique({ where: { id: head.id }, select: { postId: true } })
  return { ok: true, postId: row?.postId ?? null }
}

export type PostReserveStats = {
  operators: number
  waiting: number
  published: number
  failed: number
  publishedLast24h: number
  /** Accounts still below the target (being filled). */
  operatorsBelowTarget: number
}

/** Numbers for the settings page. */
export async function getPostReserveStats(target: number, now: Date = new Date()): Promise<PostReserveStats> {
  const [operators, byState, publishedLast24h, full] = await Promise.all([
    prisma.user.count({ where: { isOperator: true, isDeleted: false, isActive: true } }),
    prisma.operatorPostReserve.groupBy({ by: ['state'], _count: { _all: true } }),
    prisma.operatorPostReserve.count({ where: { state: 'published', updatedAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } } }),
    prisma.$queryRaw<Array<{ count: number | bigint }>>`
      SELECT COUNT(*)::int AS count FROM (
        SELECT reserve.operator_user_id
        FROM app_operator_post_reserve AS reserve
        JOIN app_users AS operator_user
          ON operator_user.id = reserve.operator_user_id
          AND operator_user.is_operator = true AND operator_user.is_deleted = false AND operator_user.is_active = true
        WHERE reserve.state IN ('queued', 'publishing')
        GROUP BY reserve.operator_user_id
        HAVING COUNT(*) > ${Math.max(0, target - RESERVE_CHUNK_SIZE)}
      ) AS filled
    `,
  ])
  const count = (state: string) => byState.find((row) => row.state === state)?._count._all ?? 0
  return {
    operators,
    waiting: count('queued') + count('publishing'),
    published: count('published'),
    failed: count('failed'),
    publishedLast24h,
    operatorsBelowTarget: Math.max(0, operators - Number(full[0]?.count ?? 0)),
  }
}
