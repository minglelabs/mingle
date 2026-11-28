import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { assignReferencePhoto, claimReferencePhoto, loadReferenceBytes, referenceKindOf, releaseReferencePhoto } from '@/server/reference-library/library'
import { generateOperatorAvatar, type AvatarGenerationResult } from '@/server/operator-avatars/generate'
import { createOperatorAccount, type CreatedOperatorAccount } from '@/server/operators/create-operator'
import { generatePersonaDrafts } from '@/server/operators/persona-draft'
import { pickSeedCountry, SEED_MALE_LEANING, SEED_MALE_SHARE } from '@/server/operators/seed-plan'
import { referenceAgeRange, referenceCountries } from '@/server/reference-library/direction'
import type { ReferenceAttributes } from '@/server/reference-library/classify'
import { generateReservePosts, isKoreaCountry, pickReserveTopics, reservePosterProfile } from '@/server/operator-post-reserve/generate'
import { drawReservePostImage, PHOTO_NO_REFERENCE } from '@/server/operator-post-reserve/post-image'
import { loadExistingReserveTexts, loadReservePersona } from '@/server/operator-post-reserve/worker'
import { canDrawImagesHere } from '@/server/operator-avatars/generate'
import type { ImageEngine } from '@/server/seedream/client'
import { runOperatorEngagement, type EngagementRunResult } from '@/server/operator-engagement/engagement'
import { getAutomationSettings, getAutomationState, saveAutomationState } from './settings'
import { refreshOperatorPresence } from '@/server/operator-presence'

/**
 * The automatic generation rules staff set in `/admin/settings/automation`:
 * - photos: one AI profile photo every N minutes for an account that has none;
 * - accounts: a few new accounts per day until the target count is reached,
 *   each from the country furthest below its share of the seed plan.
 * - posts: once a day (Korean time) each approved operator account writes one
 *   new post with a set chance, straight into the review queue.
 * - engagement: every few minutes, likes, comments, replies and comment likes
 *   that are due on recent operator posts (operator-engagement/engagement.ts).
 * Automatic accounts and posts go to the front of the review queue; staff
 * publish them there. The same steps are exported for the manual buttons,
 * which ignore the pace but nothing else.
 */
export const AVATAR_MAX_FAILURES = 3
const ACCOUNT_AGE_MIN = 20
const ACCOUNT_AGE_MAX = 34
const DAY_MS = 24 * 60 * 60_000
/** How often the reactions on recent posts are brought up to date. */
const ENGAGEMENT_INTERVAL_MS = 5 * 60_000

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
    // A staff account (no persona country, e.g. @admin) never gets an AI photo.
    where: { isOperator: true, isDeleted: false, isActive: true, image: null, operatorAccount: { personaCountry: { not: null } }, ...(skip.length ? { id: { notIn: skip } } : {}) },
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
export async function frontOfReviewRank(): Promise<number> {
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
  | { done: false; reason: 'target_reached' | 'draft_failed' | 'reference_unavailable' | 'reference_no_face' }
  | { done: true; country: string; account: CreatedOperatorAccount; referenceUsed?: boolean }

/** Creates one account in the country furthest below its share of the seed plan. */
export async function createNextSeedAccount(
  ctx: AdminContext,
  options: {
    totalTarget?: number | null; now?: Date; inReview?: boolean
    /** A photo from the reference library to draw the profile photo from (staff pick); else the oldest unused one, when any. */
    referenceId?: string | null
    /** 'seedream': staff picked Seedream 5.5 for the profile photo (reference library's 계정 만들기 only). */
    engine?: ImageEngine
    random?: () => number
  } = {},
): Promise<AccountStepResult> {
  const random = options.random ?? Math.random
  const rows = await prisma.operatorAccount.groupBy({
    by: ['personaCountry'],
    // Accounts still hidden for review count toward the target too.
    where: { user: { isOperator: true, isDeleted: false } },
    _count: { _all: true },
  })
  const total = rows.reduce((sum, row) => sum + row._count._all, 0)
  if (options.totalTarget != null && total >= options.totalTarget) return { done: false, reason: 'target_reached' }

  // 레퍼런스 짤 저장소: while unused photos are left, each new account's profile photo is drawn from one.
  const canDraw = options.engine === 'seedream' || canDrawImagesHere()
  const drawsHere = options.inReview === true && canDraw
  // The country comes first, drawn by the plan's shares (staff, 2026-11-28), and the
  // library photo must suit it: one read as another country is skipped.
  const due = options.referenceId ? null : pickSeedCountry(null, random)
  // The library is mostly women, and a new account takes its photo's gender: a
  // turn for a male-leaning country asks for a man's photo first (staff, 2026-11-26).
  const wantMale = due !== null && SEED_MALE_LEANING.has(due) && random() < SEED_MALE_SHARE
  const reference = drawsHere || options.referenceId
    ? await claimReferencePhoto({
        userId: 'pending', kind: 'avatar', id: options.referenceId ?? null,
        // A profile photo always shows a face (staff, 2026-11-28).
        kinds: ['face'],
        ...(wantMale ? { gender: 'male' as const } : {}),
        ...(due ? {
          skip: (item: { attributes?: ReferenceAttributes | null }) => {
            const countries = referenceCountries(item.attributes)
            return countries !== null && !countries.includes(due)
          },
          prefer: (item: { attributes?: ReferenceAttributes | null }) => referenceCountries(item.attributes)?.includes(due) ?? false,
        } : {}),
      }).catch(() => null)
    : null
  if (options.referenceId && !reference) return { done: false, reason: 'reference_unavailable' }
  // Staff picked a photo without a face: never a profile photo.
  if (reference && referenceKindOf(reference) !== 'face') {
    await releaseReferencePhoto(reference.id).catch(() => {})
    return { done: false, reason: 'reference_no_face' }
  }
  // A profile photo from the library: the persona is made to suit its person (about the
  // same age, a country of the same look), since only the face is changed (staff, 2026-11-25).
  const referenceKind = reference ? referenceKindOf(reference) : null
  const suits = reference && referenceKind !== 'thing' ? reference.attributes : null
  const country = due ?? pickSeedCountry(referenceCountries(suits), random)
  const ages = referenceAgeRange(suits)
  try {
    const { drafts } = await generatePersonaDrafts({
      count: 1, countries: [country], ageMin: ages?.min ?? ACCOUNT_AGE_MIN, ageMax: ages?.max ?? ACCOUNT_AGE_MAX,
      genderMix: reference?.gender ?? (SEED_MALE_LEANING.has(country) ? 'mostly_male' : 'balanced'),
    })
    if (!drafts[0]) {
      if (reference) await releaseReferencePhoto(reference.id).catch(() => {})
      return { done: false, reason: 'draft_failed' }
    }
    const account = await createOperatorAccount(ctx, drafts[0], {
      now: options.now,
      ...(options.inReview ? { inReview: { reviewRank: await frontOfReviewRank() } } : {}),
    })
    if (reference) await assignReferencePhoto(reference.id, account.userId).catch(() => {})
    let referenceUsed = false
    // A new account waiting for review gets its photo now, so staff judge both together.
    if (options.inReview && canDraw) {
      const bytes = reference ? await loadReferenceBytes(reference).catch(() => null) : null
      const libraryReference = reference && bytes ? { reference: bytes, kind: referenceKindOf(reference), note: reference.note, attributes: reference.attributes } : null
      const drawn = await generateOperatorAvatar(ctx, account.userId, { now: options.now, engine: options.engine, ...(libraryReference ? { libraryReference } : {}) }).catch(() => null)
      // A photo that was not drawn from goes back to the library for the next account.
      referenceUsed = Boolean(reference && libraryReference && drawn?.ok)
      if (reference && !referenceUsed) await releaseReferencePhoto(reference.id).catch(() => {})
    } else if (reference) {
      await releaseReferencePhoto(reference.id).catch(() => {})
    }
    return { done: true, country, account, referenceUsed }
  } catch (error) {
    if (reference) await releaseReferencePhoto(reference.id).catch(() => {})
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
  engagement: 'off' | 'waiting' | EngagementRunResult | 'failed'
}

export type DailyPostsResult = { accounts: number; written: number; failed: number }

/**
 * One day's posts: each approved, live operator account writes one post with
 * `chancePercent` odds, and with a separate `secondChancePercent` roll one
 * more (staff, 2026-11-25: 40% one post, 20% another). Each goes into review
 * at the front of the queue, its photo drawn right away where the server can
 * draw (one at a time, so the pool is not flooded). Never throws.
 */
export async function writeDailyOperatorPosts(chancePercent: number, now: Date, random: () => number = Math.random, secondChancePercent = 0): Promise<DailyPostsResult> {
  const accounts = await prisma.user.findMany({
    // A staff account (no persona country, e.g. @admin) is never written for.
    where: { isOperator: true, isDeleted: false, isActive: true, operatorAccount: { reviewState: 'approved', personaCountry: { not: null } } },
    select: { id: true },
  })
  const picked = accounts
    .map(({ id }) => ({
      id,
      count: (random() * 100 < chancePercent ? 1 : 0) + (secondChancePercent > 0 && random() * 100 < secondChancePercent ? 1 : 0),
    }))
    .filter((account) => account.count > 0)
  const result: DailyPostsResult = { accounts: picked.length, written: 0, failed: 0 }
  for (const { id, count } of picked) {
    try {
      const persona = await loadReservePersona(id, now)
      if (!persona) { result.failed += count; continue }
      // Both of a day's posts are written together, so they differ in topic and wording.
      const posts = await generateReservePosts({
        persona,
        topics: pickReserveTopics(count, random, reservePosterProfile(id).topicFactors, { korea: !isKoreaCountry(persona.country) }),
        existingTexts: await loadExistingReserveTexts(id),
        random,
        seed: id,
      })
      result.failed += Math.max(0, count - posts.length)
      for (const post of posts.slice(0, count)) {
        const row = await prisma.operatorPostReserve.create({
          data: {
            operatorUserId: id,
            text: post.text,
            topic: post.topic,
            language: post.language === persona.language ? null : post.language,
            imagePrompt: post.imagePrompt,
            state: 'review',
            // Photo posts go to the front; a text-only one waits in the default order, behind the photo posts.
            reviewRank: post.imagePrompt ? await frontOfReviewRank() : null,
          },
          select: { id: true },
        })
        result.written += 1
        if (post.imagePrompt && canDrawImagesHere()) {
          let noReference = false
          const image = await drawReservePostImage(id, post.imagePrompt, undefined, undefined, { onNoReference: () => { noReference = true } })
          if (image) {
            await prisma.operatorPostReserve.updateMany({
              where: { id: row.id, state: 'review', imageObjectKey: null },
              data: { imageObjectKey: image.objectKey, imageWidth: image.width, imageHeight: image.height },
            })
          } else if (noReference) {
            // Drawn once staff upload a fitting reference photo (사진 그리기 / 레퍼런스로 재제작).
            await prisma.operatorPostReserve.updateMany({ where: { id: row.id, state: 'review', imageObjectKey: null }, data: { error: PHOTO_NO_REFERENCE } })
          }
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
  // Operator accounts that look online, whatever the other rules (see @/server/operator-presence).
  await refreshOperatorPresence(now()).catch((error) => {
    console.warn('[operator-automation] presence_failed', { error: error instanceof Error ? error.name : 'unknown' })
  })
  const settings = await getAutomationSettings()
  const summary: AutomationRunSummary = { avatar: 'off', account: 'off', posts: 'off', engagement: 'off' }
  if (!settings.avatars.enabled && !settings.accounts.enabled && !settings.posts.enabled && !settings.engagement.enabled) return summary
  const state = await getAutomationState()

  if (settings.accounts.enabled) {
    if (!due(state.lastAccountAt, DAY_MS / settings.accounts.perDay, now())) summary.account = 'waiting'
    else {
      console.info('[operator-automation] account_step_start')
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
      console.info('[operator-automation] posts_step_start', { day: today, chancePercent: settings.posts.chancePercent, secondChancePercent: settings.posts.secondChancePercent })
      summary.posts = await writeDailyOperatorPosts(settings.posts.chancePercent, now(), Math.random, settings.posts.secondChancePercent)
    }
  }

  if (settings.engagement.enabled) {
    if (!due(state.lastEngagementAt, ENGAGEMENT_INTERVAL_MS, now())) summary.engagement = 'waiting'
    else {
      await saveAutomationState({ lastEngagementAt: now().toISOString() })
      summary.engagement = await runOperatorEngagement(now()).catch((error) => {
        console.warn('[operator-automation] engagement_failed', { error: error instanceof Error ? error.name : 'unknown' })
        return 'failed' as const
      })
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
