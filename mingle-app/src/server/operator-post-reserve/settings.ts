import { prisma } from '@/lib/prisma'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'

/**
 * The post-reserve setting, edited by staff in `/admin/settings/post-reserve`
 * and stored as one row of `app_admin_settings`. Off until staff turn it on:
 * while off nothing is generated and nothing is released.
 */
export const POST_RESERVE_SETTING_KEY = 'operator_post_reserve'

export const POST_RESERVE_DEFAULT_TARGET = 200
export const POST_RESERVE_MAX_TARGET = 500
export const POST_RESERVE_DEFAULT_DAILY_PERCENT = 1
export const POST_RESERVE_MAX_DAILY_PERCENT = 10

export type PostReserveSettings = {
  enabled: boolean
  /** Latent posts kept waiting per operator account; the worker refills up to this. */
  targetPerOperator: number
  /** Share of the target released per day, per account (1% of 200 = 2 posts a day). */
  dailyPercent: number
}

export const POST_RESERVE_DEFAULTS: PostReserveSettings = {
  enabled: false,
  targetPerOperator: POST_RESERVE_DEFAULT_TARGET,
  dailyPercent: POST_RESERVE_DEFAULT_DAILY_PERCENT,
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

/** A whole number of posts within 10-500, or null. */
export function parsePostReserveTarget(value: unknown): number | null {
  const target = toNumber(value)
  return target !== null && Number.isInteger(target) && target >= 10 && target <= POST_RESERVE_MAX_TARGET ? target : null
}

/** A percentage within 0.1-10 (one decimal), or null. */
export function parsePostReserveDailyPercent(value: unknown): number | null {
  const percent = toNumber(value)
  if (percent === null || percent < 0.1 || percent > POST_RESERVE_MAX_DAILY_PERCENT) return null
  return Math.round(percent * 10) / 10
}

/** Posts one account releases per day: the share of the target, at least 0.1 so the gap stays finite. */
export function postsPerDay(settings: Pick<PostReserveSettings, 'targetPerOperator' | 'dailyPercent'>): number {
  return Math.max(0.1, (settings.targetPerOperator * settings.dailyPercent) / 100)
}

/** A stored value read defensively: anything malformed falls back to the default (off). */
export function normalizePostReserveSettings(value: unknown): PostReserveSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...POST_RESERVE_DEFAULTS }
  const record = value as Record<string, unknown>
  return {
    enabled: record.enabled === true,
    targetPerOperator: parsePostReserveTarget(record.targetPerOperator) ?? POST_RESERVE_DEFAULT_TARGET,
    dailyPercent: parsePostReserveDailyPercent(record.dailyPercent) ?? POST_RESERVE_DEFAULT_DAILY_PERCENT,
  }
}

export async function getPostReserveSettings(): Promise<PostReserveSettings> {
  const row = await prisma.adminSetting.findUnique({ where: { key: POST_RESERVE_SETTING_KEY }, select: { value: true } })
  return normalizePostReserveSettings(row?.value)
}

export async function updatePostReserveSettings(ctx: AdminContext, next: PostReserveSettings): Promise<PostReserveSettings> {
  await prisma.adminSetting.upsert({
    where: { key: POST_RESERVE_SETTING_KEY },
    create: { key: POST_RESERVE_SETTING_KEY, value: next, updatedBySessionId: ctx.sessionId },
    update: { value: next, updatedBySessionId: ctx.sessionId },
  })
  await writeAdminAudit(ctx, {
    action: 'settings.post_reserve',
    targetType: 'setting',
    targetId: POST_RESERVE_SETTING_KEY,
    metadata: { ...next },
  })
  return next
}
