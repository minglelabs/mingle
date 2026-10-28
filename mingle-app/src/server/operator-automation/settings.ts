import { prisma } from '@/lib/prisma'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'

/**
 * Automatic generation rules for operator accounts, edited by staff in
 * `/admin/settings/automation` and stored as one row of `app_admin_settings`.
 * Both rules are off until staff turn them on. (The third rule, latent posts,
 * has its own setting: operator-post-reserve/settings.ts.)
 */
export const AUTOMATION_SETTING_KEY = 'operator_automation'
export const AUTOMATION_STATE_KEY = 'operator_automation_state'

export type AutomationSettings = {
  avatars: {
    enabled: boolean
    /** One AI profile photo, for an account without one, every this many minutes. */
    intervalMinutes: number
  }
  accounts: {
    enabled: boolean
    /** New accounts per day, evenly spaced. */
    perDay: number
    /** Creation stops once this many active operator accounts exist. */
    totalTarget: number
  }
}

export const AUTOMATION_DEFAULTS: AutomationSettings = {
  avatars: { enabled: false, intervalMinutes: 10 },
  accounts: { enabled: false, perDay: 5, totalTarget: 100 },
}

export const AUTOMATION_LIMITS = {
  intervalMinutes: { min: 1, max: 1440 },
  perDay: { min: 1, max: 100 },
  totalTarget: { min: 1, max: 2000 },
} as const

/** A whole number within the field's limits, or null. */
export function parseAutomationInt(value: unknown, field: keyof typeof AUTOMATION_LIMITS): number | null {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isInteger(parsed)) return null
  const { min, max } = AUTOMATION_LIMITS[field]
  return parsed >= min && parsed <= max ? parsed : null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** A stored value read defensively: anything malformed falls back to the default (off). */
export function normalizeAutomationSettings(value: unknown): AutomationSettings {
  const avatars = record(record(value).avatars)
  const accounts = record(record(value).accounts)
  return {
    avatars: {
      enabled: avatars.enabled === true,
      intervalMinutes: parseAutomationInt(avatars.intervalMinutes, 'intervalMinutes') ?? AUTOMATION_DEFAULTS.avatars.intervalMinutes,
    },
    accounts: {
      enabled: accounts.enabled === true,
      perDay: parseAutomationInt(accounts.perDay, 'perDay') ?? AUTOMATION_DEFAULTS.accounts.perDay,
      totalTarget: parseAutomationInt(accounts.totalTarget, 'totalTarget') ?? AUTOMATION_DEFAULTS.accounts.totalTarget,
    },
  }
}

/** A full settings body from staff, or the first invalid field. */
export function parseAutomationSettings(value: unknown): { ok: true; settings: AutomationSettings } | { ok: false; error: string } {
  const avatars = record(record(value).avatars)
  const accounts = record(record(value).accounts)
  if (typeof avatars.enabled !== 'boolean' || typeof accounts.enabled !== 'boolean') return { ok: false, error: 'invalid_enabled' }
  const intervalMinutes = parseAutomationInt(avatars.intervalMinutes, 'intervalMinutes')
  if (intervalMinutes === null) return { ok: false, error: 'invalid_interval' }
  const perDay = parseAutomationInt(accounts.perDay, 'perDay')
  if (perDay === null) return { ok: false, error: 'invalid_per_day' }
  const totalTarget = parseAutomationInt(accounts.totalTarget, 'totalTarget')
  if (totalTarget === null) return { ok: false, error: 'invalid_total_target' }
  return { ok: true, settings: { avatars: { enabled: avatars.enabled, intervalMinutes }, accounts: { enabled: accounts.enabled, perDay, totalTarget } } }
}

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const row = await prisma.adminSetting.findUnique({ where: { key: AUTOMATION_SETTING_KEY }, select: { value: true } })
  return normalizeAutomationSettings(row?.value)
}

export async function updateAutomationSettings(ctx: AdminContext, next: AutomationSettings): Promise<AutomationSettings> {
  await prisma.adminSetting.upsert({
    where: { key: AUTOMATION_SETTING_KEY },
    create: { key: AUTOMATION_SETTING_KEY, value: next, updatedBySessionId: ctx.sessionId },
    update: { value: next, updatedBySessionId: ctx.sessionId },
  })
  await writeAdminAudit(ctx, {
    action: 'settings.automation',
    targetType: 'setting',
    targetId: AUTOMATION_SETTING_KEY,
    metadata: { avatars: next.avatars, accounts: next.accounts },
  })
  return next
}

/** When each automatic rule last ran (so the pace survives a restart). */
export type AutomationState = { lastAvatarAt: string | null; lastAccountAt: string | null }

function isoOrNull(value: unknown): string | null {
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

export async function getAutomationState(): Promise<AutomationState> {
  const row = await prisma.adminSetting.findUnique({ where: { key: AUTOMATION_STATE_KEY }, select: { value: true } })
  const value = record(row?.value)
  return { lastAvatarAt: isoOrNull(value.lastAvatarAt), lastAccountAt: isoOrNull(value.lastAccountAt) }
}

export async function saveAutomationState(patch: Partial<AutomationState>): Promise<void> {
  const next = { ...(await getAutomationState()), ...patch }
  await prisma.adminSetting.upsert({
    where: { key: AUTOMATION_STATE_KEY },
    create: { key: AUTOMATION_STATE_KEY, value: next },
    update: { value: next },
  })
}
