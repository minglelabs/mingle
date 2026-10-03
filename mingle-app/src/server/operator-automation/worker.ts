import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { generateOperatorAvatar, type AvatarGenerationResult } from '@/server/operator-avatars/generate'
import { createOperatorAccount, type CreatedOperatorAccount } from '@/server/operators/create-operator'
import { generatePersonaDrafts } from '@/server/operators/persona-draft'
import { mostUnderrepresentedCountry } from '@/server/operators/seed-plan'
import { getAutomationSettings, getAutomationState, saveAutomationState } from './settings'

/**
 * The automatic generation rules staff set in `/admin/settings/automation`:
 * - photos: one AI profile photo every N minutes for an account that has none;
 * - accounts: a few new accounts per day until the target count is reached,
 *   each from the country furthest below its share of the seed plan.
 * The same two steps are exported for the manual buttons, which ignore the
 * pace but nothing else.
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

export type AccountStepResult =
  | { done: false; reason: 'target_reached' | 'draft_failed' }
  | { done: true; country: string; account: CreatedOperatorAccount }

/** Creates one account in the country furthest below its share of the seed plan. */
export async function createNextSeedAccount(
  ctx: AdminContext,
  options: { totalTarget?: number | null; now?: Date } = {},
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
    const account = await createOperatorAccount(ctx, drafts[0], { now: options.now })
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

export type AutomationRunSummary = { avatar: 'off' | 'waiting' | 'none' | 'generated' | 'failed'; account: 'off' | 'waiting' | 'target_reached' | 'created' | 'failed' }

/** One worker run. Two settings reads and nothing else while both rules are off or not yet due. */
export async function runOperatorAutomation(options: { now?: () => Date } = {}): Promise<AutomationRunSummary> {
  const now = options.now ?? (() => new Date())
  const settings = await getAutomationSettings()
  const summary: AutomationRunSummary = { avatar: 'off', account: 'off' }
  if (!settings.avatars.enabled && !settings.accounts.enabled) return summary
  const state = await getAutomationState()

  if (settings.accounts.enabled) {
    if (!due(state.lastAccountAt, DAY_MS / settings.accounts.perDay, now())) summary.account = 'waiting'
    else {
      const step = await createNextSeedAccount(WORKER_CONTEXT, { totalTarget: settings.accounts.totalTarget, now: now() })
      summary.account = step.done ? 'created' : step.reason === 'target_reached' ? 'target_reached' : 'failed'
      // The pace holds after a failure too: a broken model must not be hammered every minute.
      if (step.done || step.reason === 'draft_failed') await saveAutomationState({ lastAccountAt: now().toISOString() })
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
