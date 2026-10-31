import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { generateOperatorAvatar, type AvatarGenerationResult } from '@/server/operator-avatars/generate'
import { createOperatorAccount, type CreatedOperatorAccount } from '@/server/operators/create-operator'
import { generatePersonaDrafts } from '@/server/operators/persona-draft'
import { mostUnderrepresentedCountry } from '@/server/operators/seed-plan'
import { generateReservePosts, pickReserveTopics, reservePosterProfile } from '@/server/operator-post-reserve/generate'
import { drawReservePostImage } from '@/server/operator-post-reserve/post-image'
import { loadExistingReserveTexts, loadReservePersona } from '@/server/operator-post-reserve/worker'
import { canDrawImagesHere } from '@/server/operator-avatars/generate'
import { getAutomationSettings, getAutomationState, saveAutomationState } from './settings'

/**
 * The automatic generation rules staff set in `/admin/settings/automation`:
 * - photos: one AI profile photo every N minutes for an account that has none;
 * - accounts: a few new accounts per day until the target count is reached,
 *   each from the country furthest below its share of the seed plan.
 * - posts: once a day (Korean time) each approved operator account writes one
 *   new post with a set chance, straight into the review queue.
 * Automatic accounts and posts go to the front of the review queue; staff
 * publish them there. The same steps are exported for the manual buttons,
 * which ignore the pace but nothing else.
 */
export const AVATAR_MAX_FAILURES = 3
const ACCOUNT_AGE_MIN = 20
const ACCOUNT_AGE_MAX = 34
const DAY_MS = 24 * 60 * 60_000

/** Audit context of the worker: no admin session is involved. */
const WORKER_CONTEXT: AdminContext = { sessionId: null, ip: null, userAgent: 'operator-automation' }

const FAILURES_KEY = Symbol.for('mingle.operatorAutomation.avatarFailures.v1')

/** userId -> failed attempts in this process, so one unpaintable account cannot block the queue. */
function avatarFailures(): Map<string, number> {
  const holder = globalThis as typeof globalThis & { [FAILURES_KEY]?: Map<string, number> }
  holder[FAILURES_KEY] ??= new Map()
  return holder[FAILURES_KEY]
}

export function __resetAvatarFailuresForTests(): void {
  avatarFailures().clear()
}

export type AutomationCounts = { operators: number; withoutPhoto: number }

export async function getAutomationCounts(): Promise<AutomationCounts> {
  const where = { isOperator: true, isDeleted: false, isActive: true } as const
  const [operators, withoutPhoto] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { ...where, image: null } }),
  ])
  return { operators, withoutPhoto }
}

export type AvatarStepResult =
  | { done: false; reason: 'none_waiting' }
  | { done: true; userId: string; result: AvatarGenerationResult }

/** Generates a photo for the oldest active account without one. */
export async function generateNextMissingAvatar(ctx: AdminContext | null = null, now: Date = new Date()): Promise<AvatarStepResult> {
  const failures = avatarFailures()
  const skip = [...failures].filter(([, count]) => count >= AVATAR_MAX_FAILURES).map(([userId]) => userId)
  const next = await prisma.user.findFirst({
    where: { isOperator: true, isDeleted: false, isActive: true, image: null, ...(skip.length ? { id: { notIn: skip } } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!next) return { done: false, reason: 'none_waiting' }
  const result = await generateOperatorAvatar(ctx, next.id, { now })
  if (result.ok) failures.delete(next.id)
  // A refused prompt will be refused again with the same spec only by chance (the spec is re-picked), so count and retry.
  else failures.set(next.id, (failures.get(next.id) ?? 0) + 1)
  return { done: true, userId: next.id, result }
}

/** A rank ahead of everything now in the review queue (lower goes first). */
async function frontOfReviewRank(): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ low: number | null }>>`
    SELECT LEAST(
      (SELECT MIN(review_rank) FROM app.app_operator_accounts),
      (SELECT MIN(review_rank) FROM app.app_operator_post_reserve)
    ) AS low`
  return Number(row?.low ?? 1) - 1
}

/** The Korean calendar day of `now`, e.g. "2026-11-01". */
export function koreanDay(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 10)
}

export type AccountStepResult =
  | { done: false; reason: 'target_reached' | 'draft_failed' }
  | { done: true; country: string; account: CreatedOperatorAccount }

/** Creates one account in the country furthest below its share of the seed plan. */
export async function createNextSeedAccount(
  ctx: AdminContext,
  options: { totalTarget?: number | null; now?: Date; inReview?: boolean } = {},
): Promise<AccountStepResult> {
  const rows = await prisma.operatorAccount.groupBy({
    by: ['personaCountry'],
    where: { user: { isOperator: true, isDeleted: false, isActive: true } },
    _count: { _all: true },
  })
  const total = rows.reduce((sum, row) => sum + row._count._all, 0)
  if (options.totalTarget != null && total >= options.totalTarget) return { done: false, reason: 'target_reached' }
  const byCountry = new Map(rows.flatMap((row) => (row.personaCountry ? [[row.personaCountry, row._count._all] as const] : [])))
  const country = mostUnderrepresentedCountry(byCountry)

  try {
    const { drafts } = await generatePersonaDrafts({
      count: 1, countries: [country], ageMin: ACCOUNT_AGE_MIN, ageMax: ACCOUNT_AGE_MAX, genderMix: 'balanced',
    })
    if (!drafts[0]) return { done: false, reason: 'draft_failed' }
    const account = await createOperatorAccount(ctx, drafts[0], {
      now: options.now,
      ...(options.inReview ? { inReview: { reviewRank: await frontOfReviewRank() } } : {}),
    })
    // A new account waiting for review gets its photo now, so staff judge both together.
    if (options.inReview && canDrawImagesHere()) await generateOperatorAvatar(ctx, account.userId, { now: options.now }).catch(() => null)
    return { done: true, country, account }
  } catch (error) {
    console.warn('[operator-automation] account_failed', {
      country,
      error: error instanceof Error ? (error as { code?: string }).code ?? error.name : 'unknown',
    })
    return { done: false, reason: 'draft_failed' }
  }
}

function due(lastAt: string | null, intervalMs: number, now: Date): boolean {
  return !lastAt || now.getTime() - Date.parse(lastAt) >= intervalMs
}

export type AutomationRunSummary = {
  avatar: 'off' | 'waiting' | 'none' | 'generated' | 'failed'
  account: 'off' | 'waiting' | 'target_reached' | 'created' | 'failed'
  posts: 'off' | 'waiting' | { accounts: number; written: number; failed: number }
}

export type DailyPostsResult = { accounts: number; written: number; failed: number }

/**
 * One day's posts: each approved, live operator account writes one post with
 * `chancePercent` odds. Each goes into review at the front of the queue, its
 * photo drawn right away where the server can draw (one at a time, so the pool
 * is not flooded). Never throws.
 */
export async function writeDailyOperatorPosts(chancePercent: number, now: Date, random: () => number = Math.random): Promise<DailyPostsResult> {
  const accounts = await prisma.user.findMany({
    where: { isOperator: true, isDeleted: false, isActive: true, operatorAccount: { reviewState: 'approved' } },
    select: { id: true },
  })
  const picked = accounts.filter(() => random() * 100 < chancePercent)
  const result: DailyPostsResult = { accounts: picked.length, written: 0, failed: 0 }
  for (const { id } of picked) {
    try {
      const persona = await loadReservePersona(id, now)
      if (!persona) { result.failed += 1; continue }
      const [post] = await generateReservePosts({
        persona,
        topics: pickReserveTopics(1, random, reservePosterProfile(id).topicFactors),
        existingTexts: await loadExistingReserveTexts(id),
        random,
        seed: id,
      })
      if (!post) { result.failed += 1; continue }
      const row = await prisma.operatorPostReserve.create({
        data: {
          operatorUserId: id,
          text: post.text,
          topic: post.topic,
          language: post.language === persona.language ? null : post.language,
          imagePrompt: post.imagePrompt,
          state: 'review',
          reviewRank: await frontOfReviewRank(),
        },
        select: { id: true },
      })
      result.written += 1
      if (post.imagePrompt && canDrawImagesHere()) {
        const image = await drawReservePostImage(id, post.imagePrompt)
        if (image) {
          await prisma.operatorPostReserve.updateMany({
            where: { id: row.id, state: 'review', imageObjectKey: null },
            data: { imageObjectKey: image.objectKey, imageWidth: image.width, imageHeight: image.height },
          })
        }
      }
    } catch (error) {
      result.failed += 1
      console.warn('[operator-automation] daily_post_failed', { operatorUserId: id, error: error instanceof Error ? error.name : 'unknown' })
    }
  }
  return result
}

/** One worker run. Two settings reads and nothing else while both rules are off or not yet due. */
export async function runOperatorAutomation(options: { now?: () => Date } = {}): Promise<AutomationRunSummary> {
  const now = options.now ?? (() => new Date())
  const settings = await getAutomationSettings()
  const summary: AutomationRunSummary = { avatar: 'off', account: 'off', posts: 'off' }
  if (!settings.avatars.enabled && !settings.accounts.enabled && !settings.posts.enabled) return summary
  const state = await getAutomationState()

  if (settings.accounts.enabled) {
    if (!due(state.lastAccountAt, DAY_MS / settings.accounts.perDay, now())) summary.account = 'waiting'
    else {
      const step = await createNextSeedAccount(WORKER_CONTEXT, { totalTarget: settings.accounts.totalTarget, now: now(), inReview: true })
      summary.account = step.done ? 'created' : step.reason === 'target_reached' ? 'target_reached' : 'failed'
      // The pace holds after a failure too: a broken model must not be hammered every minute.
      if (step.done || step.reason === 'draft_failed') await saveAutomationState({ lastAccountAt: now().toISOString() })
    }
  }

  if (settings.posts.enabled) {
    const today = koreanDay(now())
    if (state.lastPostsDay === today) summary.posts = 'waiting'
    else {
      // Marked first: a restart mid-run must not write a second batch the same day.
      await saveAutomationState({ lastPostsDay: today })
      summary.posts = await writeDailyOperatorPosts(settings.posts.chancePercent, now())
    }
  }

  if (settings.avatars.enabled) {
    if (!due(state.lastAvatarAt, settings.avatars.intervalMinutes * 60_000, now())) summary.avatar = 'waiting'
    else {
      const step = await generateNextMissingAvatar(null, now())
      summary.avatar = !step.done ? 'none' : step.result.ok ? 'generated' : 'failed'
      if (step.done) await saveAutomationState({ lastAvatarAt: now().toISOString() })
    }
  }
  return summary
}
