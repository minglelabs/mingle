import { prisma } from '@/lib/prisma'

/**
 * The first posts a new reader sees, in an order staff chose: one list for
 * Korean readers and one for everyone else. Each listed post goes to the top
 * of the feed until the reader has seen it, so a new reader's first screens
 * are exactly these, and an existing reader is not affected once they have
 * seen them. Stored as one row of `app_admin_settings`; no row, no change.
 */
export const STARTER_FEED_SETTING_KEY = 'feed_starter'

export type StarterSegment = 'ko' | 'foreign'

export type StarterFeed = Record<StarterSegment, string[]>

function postIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : []
}

export async function loadStarterFeed(): Promise<StarterFeed | null> {
  const row = await prisma.adminSetting.findUnique({ where: { key: STARTER_FEED_SETTING_KEY }, select: { value: true } })
  if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) return null
  const value = row.value as Record<string, unknown>
  return { ko: postIds(value.ko), foreign: postIds(value.foreign) }
}

export async function saveStarterFeed(feed: StarterFeed): Promise<void> {
  await prisma.adminSetting.upsert({
    where: { key: STARTER_FEED_SETTING_KEY },
    create: { key: STARTER_FEED_SETTING_KEY, value: feed },
    update: { value: feed },
  })
}

/** Korean readers get the Korean list; a reader whose language is unknown gets the other one. */
export function starterSegmentFor(language: string | null | undefined): StarterSegment {
  return language?.toLowerCase().startsWith('ko') ? 'ko' : 'foreign'
}

/** The reader's segment from their primary language. */
export async function starterSegmentOfUser(userId: string): Promise<StarterSegment> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { primaryLanguages: true } })
  return starterSegmentFor(user?.primaryLanguages[0])
}

/**
 * Moves the starter posts the reader has not seen to the front, in the
 * starter order. Posts the reader may not see (missing from `ranked`) are
 * skipped; everything else keeps its ranked order.
 */
export function applyStarterOrder(ranked: readonly string[], starter: readonly string[], viewed: ReadonlySet<string>): string[] {
  const present = new Set(ranked)
  const front = [...new Set(starter)].filter((id) => present.has(id) && !viewed.has(id))
  if (front.length === 0) return [...ranked]
  const moved = new Set(front)
  return [...front, ...ranked.filter((id) => !moved.has(id))]
}
