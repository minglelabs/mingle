import { Prisma } from '@prisma/client/index'
import { prisma } from '@/lib/prisma'
import { listConversationReadReceipts } from '@/lib/app-conversations'
import { shownCoinsDelta } from '@/lib/coin-units'
import { COIN_USAGE_KINDS, type CoinUsageKind } from './pricing'

// Read models for the usage screen (spec 9.3). Only real (non-shadow) charges count.

export type CoinUsageRange = 'today' | '7d' | '30d'

export function normalizeCoinUsageRange(value: string | null | undefined): CoinUsageRange {
  return value === 'today' || value === '30d' ? value : '7d'
}

export type CoinUsageKindSummary = {
  kind: CoinUsageKind
  coins: number
  // STT: seconds of audio. Others: number of charges (messages, clips, photos).
  seconds: number
  count: number
}

export type CoinUsageSummary = {
  range: CoinUsageRange
  totalCoins: number
  kinds: CoinUsageKindSummary[]
  // Oldest first; one entry per local day of the range, including empty days.
  days: { date: string; coins: number }[]
}

/** 'YYYY-MM-DD HH:MM:SS.mmm' in UTC, for comparing against timestamp(3) columns in raw SQL. */
function utcTimestampLiteral(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

function clampTzOffsetMinutes(value: number): number {
  return Number.isFinite(value) ? Math.max(-14 * 60, Math.min(14 * 60, Math.trunc(value))) : 0
}

/**
 * tzOffsetMinutes = minutes east of UTC (KST = 540), used only to cut day
 * buckets where the user's days start.
 */
export async function getCoinUsageSummary(
  userId: string,
  range: CoinUsageRange,
  options: { tzOffsetMinutes?: number; now?: Date } = {},
): Promise<CoinUsageSummary> {
  const now = options.now ?? new Date()
  const offsetMs = clampTzOffsetMinutes(options.tzOffsetMinutes ?? 0) * 60_000
  const dayCount = range === 'today' ? 1 : range === '7d' ? 7 : 30
  // Local midnight of the first day, expressed in UTC.
  const localNow = new Date(now.getTime() + offsetMs)
  const localMidnight = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())
  const firstLocalDay = localMidnight - (dayCount - 1) * 86_400_000
  const since = new Date(firstLocalDay - offsetMs)
  const offsetInterval = `${Math.round(offsetMs / 1000)} seconds`

  // Each spend counted as the whole Hash it took off the shown balance
  // (shownCoinsDelta), so the totals match what left the balance.
  const rows = await prisma.$queryRaw<Array<{
    kind: string
    day: Date
    amount: bigint
    after: bigint
    seconds: number | null
  }>>(Prisma.sql`
    SELECT
      c.kind,
      date_trunc('day', l.created_at + ${offsetInterval}::interval) AS day,
      l.amount_micro AS amount,
      l.balance_after_micro AS after,
      COALESCE((c.units->>'second')::float8, 0)::float8 AS seconds
    FROM app.app_coin_ledger l
    JOIN app.app_coin_usage_charges c ON c.id = l.usage_charge_id
    WHERE l.user_id = ${userId}
      AND l.type = 'spend'
      AND l.created_at >= ${utcTimestampLiteral(since)}::timestamp`)

  const byKind = new Map<string, { coins: number; seconds: number; count: number }>()
  const byDay = new Map<string, number>()
  let totalCoins = 0
  for (const row of rows) {
    const coins = shownCoinsDelta(BigInt(row.amount), BigInt(row.after))
    totalCoins += coins
    const kind = byKind.get(row.kind) ?? { coins: 0, seconds: 0, count: 0 }
    kind.coins += coins
    kind.seconds += row.seconds ?? 0
    kind.count += 1
    byKind.set(row.kind, kind)
    const date = row.day.toISOString().slice(0, 10)
    byDay.set(date, (byDay.get(date) ?? 0) + coins)
  }

  return {
    range,
    totalCoins,
    kinds: COIN_USAGE_KINDS.map((kind) => {
      const entry = byKind.get(kind)
      return {
        kind,
        coins: entry?.coins ?? 0,
        seconds: Math.round(entry?.seconds ?? 0),
        count: entry?.count ?? 0,
      }
    }),
    days: Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(firstLocalDay + index * 86_400_000).toISOString().slice(0, 10)
      return { date, coins: byDay.get(date) ?? 0 }
    }),
  }
}

export type CoinHistoryItem =
  | {
      id: string
      type: 'grant'
      // daily_free | purchase | admin_grant | signup_bonus | refund_reversal | gift
      source: string
      coins: number
      at: string
      // Gifts only: who sent it.
      counterpart?: string | null
    }
  | {
      id: string
      type: 'usage'
      coins: number
      at: string
      conversationTitle: string | null
      sttSeconds: number
      breakdown: Partial<Record<CoinUsageKind, number>>
      /** Per feature: what it was, how long or how many, and what it cost. */
      details: CoinUsageDetail[]
      /** First and last charge of the group. */
      firstAt: string
    }
  | {
      id: string
      // expire | refund_clawback | admin_revoke | adjust | gift_sent
      type: 'removal'
      reason: string
      coins: number
      at: string
      // Gifts only: who received it.
      counterpart?: string | null
    }

const HISTORY_PAGE_SIZE = 100

/**
 * What a charge paid for, finer than its kind: voice talk captions and
 * read-aloud, the room's own speech recognition and read-aloud, typed
 * messages, other translation, photos.
 */
export type CoinUsageFeature = 'voice_caption' | 'voice_listen' | 'speech' | 'read_aloud' | 'typed' | 'translation' | 'photo'
export const COIN_USAGE_FEATURE_ORDER: readonly CoinUsageFeature[] = ['voice_caption', 'voice_listen', 'speech', 'read_aloud', 'typed', 'translation', 'photo']

export type CoinUsageDetail = { feature: CoinUsageFeature; coins: number; seconds: number; count: number }

export function coinUsageFeatureOf(charge: { kind: string; idempotencyKey?: string | null; units?: unknown } | undefined): CoinUsageFeature {
  const key = charge?.idempotencyKey ?? ''
  if (key.startsWith('voice-caption-stt:')) return 'voice_caption'
  if (key.startsWith('voice-playback-tts:')) return 'voice_listen'
  if (charge?.kind === 'stt') return 'speech'
  if (charge?.kind === 'tts') return 'read_aloud'
  if (charge?.kind === 'image_text') return 'photo'
  const message = (charge?.units as { message?: unknown } | null)?.message
  return typeof message === 'number' && message > 0 ? 'typed' : 'translation'
}

type UsageGroup = Extract<CoinHistoryItem, { type: 'usage' }> & {
  breakdownCoins: Map<string, number>
  featureTotals: Map<CoinUsageFeature, { coins: number; seconds: number; count: number }>
}

/**
 * Ledger history, newest first. Spend rows are folded into one item per
 * conversation per UTC day, so the list reads as "this conversation cost 31
 * coins" rather than hundreds of per-chunk rows.
 */
export async function getCoinHistory(userId: string, cursor: string | null): Promise<{
  items: CoinHistoryItem[]
  nextCursor: string | null
}> {
  const cursorId = cursor && /^\d+$/.test(cursor) ? BigInt(cursor) : null
  const rows = await prisma.appCoinLedger.findMany({
    where: { userId, ...(cursorId === null ? {} : { id: { lt: cursorId } }) },
    orderBy: { id: 'desc' },
    take: HISTORY_PAGE_SIZE,
    select: { id: true, type: true, amountMicro: true, balanceAfterMicro: true, usageChargeId: true, meta: true, createdAt: true },
  })

  const chargeIds = rows.map(row => row.usageChargeId).filter((id): id is string => Boolean(id))
  const charges = chargeIds.length
    ? await prisma.appCoinUsageCharge.findMany({
        where: { id: { in: chargeIds } },
        select: { id: true, kind: true, units: true, sessionKey: true, idempotencyKey: true },
      })
    : []
  const chargeById = new Map(charges.map(charge => [charge.id, charge]))
  const sessionKeys = [...new Set(charges.map(charge => charge.sessionKey).filter((key): key is string => Boolean(key)))]
  const channels = sessionKeys.length
    ? await prisma.appConversationChannel.findMany({
        where: { sessionKey: { in: sessionKeys } },
        select: { sessionKey: true, title: true },
      })
    : []
  const titleBySessionKey = new Map(channels.map(channel => [channel.sessionKey, channel.title]))

  // Gift rows name the other user.
  const giftUserId = (meta: unknown): string | null => {
    const value = meta as { fromUserId?: unknown; toUserId?: unknown } | null
    const id = value?.fromUserId ?? value?.toUserId
    return typeof id === 'string' ? id : null
  }
  const giftUserIds = [...new Set(rows.map(row => giftUserId(row.meta)).filter((id): id is string => Boolean(id)))]
  const giftUsers = giftUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: giftUserIds } }, select: { id: true, name: true, handle: true } })
    : []
  const giftUserName = new Map(giftUsers.map(user => [user.id, user.name?.trim() || `@${user.handle}`]))
  const counterpartOf = (meta: unknown) => {
    const id = giftUserId(meta)
    return id ? { counterpart: giftUserName.get(id) ?? null } : {}
  }

  const items: Array<CoinHistoryItem | UsageGroup> = []
  const usageGroups = new Map<string, UsageGroup>()
  for (const row of rows) {
    const at = row.createdAt.toISOString()
    if (row.type === 'grant') {
      const meta = row.meta as { source?: unknown } | null
      items.push({
        id: row.id.toString(),
        type: 'grant',
        source: typeof meta?.source === 'string' ? meta.source : 'admin_grant',
        coins: shownCoinsDelta(row.amountMicro, row.balanceAfterMicro),
        at,
        ...counterpartOf(row.meta),
      })
      continue
    }
    if (row.type !== 'spend') {
      items.push({ id: row.id.toString(), type: 'removal', reason: row.type, coins: shownCoinsDelta(row.amountMicro, row.balanceAfterMicro), at, ...counterpartOf(row.meta) })
      continue
    }
    const charge = row.usageChargeId ? chargeById.get(row.usageChargeId) : undefined
    const sessionKey = charge?.sessionKey ?? ''
    const groupKey = `${at.slice(0, 10)}:${sessionKey}`
    let group = usageGroups.get(groupKey)
    if (!group) {
      group = {
        id: row.id.toString(),
        type: 'usage',
        coins: 0,
        at,
        conversationTitle: titleBySessionKey.get(sessionKey) ?? null,
        sttSeconds: 0,
        breakdown: {},
        details: [],
        firstAt: at,
        breakdownCoins: new Map(),
        featureTotals: new Map(),
      }
      usageGroups.set(groupKey, group)
      items.push(group)
    }
    // Whole Hash this spend took off the shown balance (often 0 after a 1).
    const spent = shownCoinsDelta(row.amountMicro, row.balanceAfterMicro)
    group.coins += spent
    const kind = charge?.kind ?? 'translation'
    group.breakdownCoins.set(kind, (group.breakdownCoins.get(kind) ?? 0) + spent)
    const seconds = (charge?.units as { second?: unknown } | null)?.second
    if (kind === 'stt' && typeof seconds === 'number') group.sttSeconds += seconds
    // Newest first: each older row moves the group's start back.
    group.firstAt = at
    const feature = coinUsageFeatureOf(charge)
    const total = group.featureTotals.get(feature) ?? { coins: 0, seconds: 0, count: 0 }
    total.coins += spent
    total.seconds += typeof seconds === 'number' ? seconds : 0
    total.count += 1
    group.featureTotals.set(feature, total)
  }

  return {
    items: items.map((item) => {
      if (!('breakdownCoins' in item)) return item
      const { breakdownCoins, featureTotals, ...usage } = item
      return {
        ...usage,
        breakdown: Object.fromEntries(breakdownCoins),
        details: COIN_USAGE_FEATURE_ORDER.filter((feature) => featureTotals.has(feature)).map((feature) => {
          const total = featureTotals.get(feature)!
          return { feature, coins: total.coins, seconds: Math.round(total.seconds), count: total.count }
        }),
      }
    }),
    nextCursor: rows.length === HISTORY_PAGE_SIZE ? rows[rows.length - 1].id.toString() : null,
  }
}

export type ConversationCoinUsage = {
  // Every current member, including those who have spent nothing here.
  members: { userId: string; coins: number }[]
  totalCoins: number
}

/**
 * Hash spent in one room, per member (the room's usage list). Members only:
 * null when the caller is not a visible member. Charges are tied to a room by
 * its session key; only real (non-shadow) charges count.
 */
export async function getConversationCoinUsage(conversationId: string, viewerId: string): Promise<ConversationCoinUsage | null> {
  const room = await listConversationReadReceipts({ conversationId, userId: viewerId })
  if (!room) return null
  const memberIds = room.members.map(member => member.userId)
  // The whole Hash each spend took off its payer's shown balance (shownCoinsDelta).
  const rows = memberIds.length
    ? await prisma.$queryRaw<Array<{ userId: string; amount: bigint; after: bigint }>>(Prisma.sql`
        SELECT l.user_id AS "userId", l.amount_micro AS amount, l.balance_after_micro AS after
        FROM app.app_coin_ledger l
        JOIN app.app_coin_usage_charges c ON c.id = l.usage_charge_id
        WHERE l.type = 'spend'
          AND c.session_key = ${room.sessionKey}
          AND c.shadow = false
          AND l.user_id IN (${Prisma.join(memberIds)})`)
    : []
  const coinsByUser = new Map<string, number>()
  for (const row of rows) {
    coinsByUser.set(row.userId, (coinsByUser.get(row.userId) ?? 0) + shownCoinsDelta(BigInt(row.amount), BigInt(row.after)))
  }
  const members = memberIds.map(userId => ({ userId, coins: coinsByUser.get(userId) ?? 0 }))
  return {
    members,
    totalCoins: [...coinsByUser.values()].reduce((sum, coins) => sum + coins, 0),
  }
}
