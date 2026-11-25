import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Which operator photos Seedream 5.5 drew, for staff to see on the photo
 * (staff, 2026-11-25). Every other drawn photo comes from the ChatGPT pool,
 * the default, so only Seedream's are listed: post photos by object key,
 * profile photos by image URL. Kept in an admin setting (no schema change).
 */
const SETTING_KEY = 'seedream_drawn_images'
/** Seedream is staff-picked one photo at a time and capped at the provider; old entries fall off. */
const MAX_ENTRIES = 5000
const CACHE_MS = 30_000

export type PhotoEngine = 'chatgpt' | 'seedream'

let cache: { at: number; ids: Set<string> } | null = null

function parse(value: unknown): string[] {
  const ids = value && typeof value === 'object' && !Array.isArray(value) ? (value as { ids?: unknown }).ids : null
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : []
}

async function change(update: (ids: string[]) => string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.adminSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: { ids: [] } }, update: {} })
    await tx.$queryRaw`SELECT key FROM app.app_admin_settings WHERE key = ${SETTING_KEY} FOR UPDATE`
    const row = await tx.adminSetting.findUnique({ where: { key: SETTING_KEY }, select: { value: true } })
    const ids = update(parse(row?.value)).slice(-MAX_ENTRIES)
    await tx.adminSetting.update({ where: { key: SETTING_KEY }, data: { value: { ids } as unknown as Prisma.InputJsonValue } })
  }, { maxWait: 15_000, timeout: 30_000 })
  cache = null
}

/** Records a photo Seedream drew (a post photo's object key or a profile photo's URL). Never throws. */
export async function markSeedreamImage(id: string | null | undefined): Promise<void> {
  if (!id) return
  await change((ids) => (ids.includes(id) ? ids : [...ids, id])).catch((error) => {
    console.warn('[seedream] mark_failed', { error: error instanceof Error ? error.name : 'unknown' })
  })
}

/** A Seedream photo staff edited (pen, blur, stickers) under a new key stays Seedream's. Never throws. */
export async function moveSeedreamImage(from: string, to: string): Promise<void> {
  if (!from || !to || from === to) return
  const ids = await seedreamImageIds().catch(() => new Set<string>())
  if (!ids.has(from)) return
  await change((list) => (list.includes(to) ? list : [...list, to])).catch(() => {})
}

/** Every photo Seedream drew, read at most every 30 s per server. */
export async function seedreamImageIds(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ids
  const row = await prisma.adminSetting.findUnique({ where: { key: SETTING_KEY }, select: { value: true } })
  cache = { at: Date.now(), ids: new Set(parse(row?.value)) }
  return cache.ids
}

/** Which engine drew this photo; null when there is no photo. */
export function photoEngineOf(id: string | null | undefined, seedream: ReadonlySet<string>): PhotoEngine | null {
  if (!id) return null
  return seedream.has(id) ? 'seedream' : 'chatgpt'
}
