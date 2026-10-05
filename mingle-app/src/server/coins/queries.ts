import { Prisma } from '@prisma/client/index'
import { prisma } from '@/lib/prisma'
import { microToSpentCoins } from '@/lib/coin-units'
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

  const rows = await prisma.$queryRaw<Array<{
    kind: string
    day: Date
    charged: bigint | null
    seconds: number | null
    count: bigint
  }>>(Prisma.sql`
    SELECT
      kind,
      date_trunc('day', created_at + ${offsetInterval}::interval) AS day,
      SUM(charged_micro)::bigint AS charged,
      SUM(COALESCE((units->>'second')::float8, 0))::float8 AS seconds,
      COUNT(*)::bigint AS count
    FROM app_coin_usage_charges
    WHERE user_id = ${userId}
      AND shadow = false
      AND created_at >= ${utcTimestampLiteral(since)}::timestamp
    GROUP BY kind, day`)

  const byKind = new Map<string, { micro: bigint; seconds: number; count: number }>()
  const byDay = new Map<string, bigint>()
  let totalMicro = 0n
  for (const row of rows) {
    const micro = row.charged ?? 0n
    totalMicro += micro
    const kind = byKind.get(row.kind) ?? { micro: 0n, seconds: 0, count: 0 }
    kind.micro += micro
    kind.seconds += row.seconds ?? 0
    kind.count += Number(row.count)
    byKind.set(row.kind, kind)
    const date = row.day.toISOString().slice(0, 10)
    byDay.set(date, (byDay.get(date) ?? 0n) + micro)
  }

  return {
    range,
    totalCoins: microToSpentCoins(totalMicro),
    kinds: COIN_USAGE_KINDS.map((kind) => {
      const entry = byKind.get(kind)
      return {
        kind,
        coins: microToSpentCoins(entry?.micro ?? 0n),
        seconds: Math.round(entry?.seconds ?? 0),
        count: entry?.count ?? 0,
      }
    }),
    days: Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(firstLocalDay + index * 86_400_000).toISOString().slice(0, 10)
      return { date, coins: microToSpentCoins(byDay.get(date) ?? 0n) }
    }),
  }
}

export type CoinHistoryItem =
  | {
      id: string
      type: 'grant'
      // daily_free | purchase | admin_grant | signup_bonus | refund_reversal
      source: string
      coins: number
      at: string
    }
  | {
      id: string
      type: 'usage'
      coins: number
      at: string
      conversationTitle: string | null
      sttSeconds: number
      breakdown: Partial<Record<CoinUsageKind, number>>
    }
  | {
      id: string
      // expire | refund_clawback | admin_revoke | adjust
      type: 'removal'
      reason: string
      coins: number
      at: string
    }

const HISTORY_PAGE_SIZE = 100

type UsageGroup = Extract<CoinHistoryItem, { type: 'usage' }> & { micro: bigint; breakdownMicro: Map<string, bigint> }

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
    select: { id: true, type: true, amountMicro: true, usageChargeId: true, meta: true, createdAt: true },
  })

  const chargeIds = rows.map(row => row.usageChargeId).filter((id): id is string => Boolean(id))
  const charges = chargeIds.length
    ? await prisma.appCoinUsageCharge.findMany({
        where: { id: { in: chargeIds } },
        select: { id: true, kind: true, units: true, sessionKey: true },
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
        coins: microToSpentCoins(row.amountMicro),
        at,
      })
      continue
    }
    if (row.type !== 'spend') {
      items.push({ id: row.id.toString(), type: 'removal', reason: row.type, coins: microToSpentCoins(row.amountMicro), at })
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
        micro: 0n,
        breakdownMicro: new Map(),
      }
      usageGroups.set(groupKey, group)
      items.push(group)
    }
    const spent = -row.amountMicro
    group.micro += spent
    const kind = charge?.kind ?? 'translation'
    group.breakdownMicro.set(kind, (group.breakdownMicro.get(kind) ?? 0n) + spent)
    const seconds = (charge?.units as { second?: unknown } | null)?.second
    if (kind === 'stt' && typeof seconds === 'number') group.sttSeconds += seconds
  }

  return {
    items: items.map((item) => {
      if (!('breakdownMicro' in item)) return item
      const { micro, breakdownMicro, ...usage } = item
      return {
        ...usage,
        coins: microToSpentCoins(micro),
        breakdown: Object.fromEntries([...breakdownMicro].map(([kind, value]) => [kind, microToSpentCoins(value)])),
      }
    }),
    nextCursor: rows.length === HISTORY_PAGE_SIZE ? rows[rows.length - 1].id.toString() : null,
  }
}
