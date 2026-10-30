import { prisma } from '@/lib/prisma'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'

/**
 * The operator auto-reply setting, edited by staff in
 * `/admin/settings/auto-reply` and stored as one row of `app_admin_settings`.
 *
 * Off until staff turn it on. `enabledAt` is stamped when it is turned on:
 * only messages that arrive after it are ever answered automatically, so
 * switching it on never answers the backlog.
 */
export const AUTO_REPLY_SETTING_KEY = 'operator_auto_reply'
export const AUTO_REPLY_DEFAULT_DELAY_MINUTES = 5
export const AUTO_REPLY_MIN_DELAY_MINUTES = 1
export const AUTO_REPLY_MAX_DELAY_MINUTES = 1440

export type AutoReplySettings = {
  enabled: boolean
  /** N: minutes a real user's message waits for staff before the AI answers. */
  delayMinutes: number
  /** ISO time auto-reply was last turned on; null while it has never been on. */
  enabledAt: string | null
}

export const AUTO_REPLY_DEFAULTS: AutoReplySettings = {
  enabled: false,
  delayMinutes: AUTO_REPLY_DEFAULT_DELAY_MINUTES,
  enabledAt: null,
}

/** A whole number of minutes within 1-1440, or null. */
export function parseAutoReplyDelayMinutes(value: unknown): number | null {
  const minutes = typeof value === 'string' && value.trim() ? Number(value) : value
  if (typeof minutes !== 'number' || !Number.isInteger(minutes)) return null
  return minutes >= AUTO_REPLY_MIN_DELAY_MINUTES && minutes <= AUTO_REPLY_MAX_DELAY_MINUTES ? minutes : null
}

/** A stored value read defensively: anything malformed falls back to the default (off). */
export function normalizeAutoReplySettings(value: unknown): AutoReplySettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...AUTO_REPLY_DEFAULTS }
  const record = value as Record<string, unknown>
  const enabledAtMs = typeof record.enabledAt === 'string' ? Date.parse(record.enabledAt) : Number.NaN
  const enabledAt = Number.isFinite(enabledAtMs) ? new Date(enabledAtMs).toISOString() : null
  return {
    // Without a start time there is no bound on the backlog, so it counts as off.
    enabled: record.enabled === true && enabledAt !== null,
    delayMinutes: parseAutoReplyDelayMinutes(record.delayMinutes) ?? AUTO_REPLY_DEFAULT_DELAY_MINUTES,
    enabledAt,
  }
}

export async function getAutoReplySettings(): Promise<AutoReplySettings> {
  const row = await prisma.adminSetting.findUnique({ where: { key: AUTO_REPLY_SETTING_KEY }, select: { value: true } })
  return normalizeAutoReplySettings(row?.value)
}

export async function updateAutoReplySettings(
  ctx: AdminContext,
  input: { enabled: boolean; delayMinutes: number },
  now: Date = new Date(),
): Promise<AutoReplySettings> {
  const current = await getAutoReplySettings()
  const next: AutoReplySettings = {
    enabled: input.enabled,
    delayMinutes: input.delayMinutes,
    // Turning it on (again) starts a fresh window; a delay change keeps it.
    enabledAt: input.enabled ? (current.enabled && current.enabledAt ? current.enabledAt : now.toISOString()) : current.enabledAt,
  }
  await prisma.adminSetting.upsert({
    where: { key: AUTO_REPLY_SETTING_KEY },
    create: { key: AUTO_REPLY_SETTING_KEY, value: next, updatedBySessionId: ctx.sessionId },
    update: { value: next, updatedBySessionId: ctx.sessionId },
  })
  await writeAdminAudit(ctx, {
    action: 'settings.auto_reply',
    targetType: 'setting',
    targetId: AUTO_REPLY_SETTING_KEY,
    metadata: { enabled: next.enabled, delayMinutes: next.delayMinutes },
  })
  return next
}
