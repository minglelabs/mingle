import { coinsToMicro } from '@/lib/coin-units'
import { resolveUserCoinBillingMode } from '@/server/coins/config'
import { isFreeCoinGrantEligible } from '@/server/coins/free-grants'
import { grantLot, hasLedgerEntry, withLockedWallet } from '@/server/coins/ledger'

// Daily attendance (owner, 2026-11-26): opening the app on a day (Korea time)
// pays 100 Hash; the seventh day in a row pays 300 more, and the count starts
// again. A missed day starts it again at one. Like every free Hash, only for
// accounts signed in with Apple or Google (@/server/coins/free-grants), and
// only where Hash is really charged. Each day is one ledger key, so a retry
// or a second phone pays nothing more.
//
// ATTENDANCE_DAILY_COINS (default 100) and ATTENDANCE_WEEK_BONUS_COINS
// (default 300) set the amounts; 0 turns that part off.

export const ATTENDANCE_STREAK_DAYS = 7
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const ATTENDANCE_SOURCE = 'attendance'
export const ATTENDANCE_BONUS_SOURCE = 'attendance_bonus'

function readCoins(raw: string | undefined, fallback: number): number {
  const value = (raw ?? '').trim()
  if (!value) return fallback
  const coins = Number.parseInt(value, 10)
  return Number.isFinite(coins) && coins >= 0 ? coins : fallback
}

export function readAttendanceCoins(env: NodeJS.ProcessEnv = process.env): { daily: number; weekBonus: number } {
  return {
    daily: readCoins(env.ATTENDANCE_DAILY_COINS, 100),
    weekBonus: readCoins(env.ATTENDANCE_WEEK_BONUS_COINS, 300),
  }
}

/** The day in Korea, as YYYY-MM-DD. */
export function kstDate(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Today's place in the streak: the day after yesterday's, or one. Day 8 is day 1 of the next week. */
export function nextStreakDay(last: { date: string; day: number } | null, today: string): number {
  if (!last) return 1
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10)
  if (last.date !== yesterday) return 1
  return (last.day % ATTENDANCE_STREAK_DAYS) + 1
}

export type AttendanceResult =
  /** Not offered to this account (Hash not charged, or not an Apple/Google sign-in). */
  | { status: 'off' }
  | { status: 'granted'; day: number; coins: number; bonus: number }
  | { status: 'already'; day: number }

function readMark(meta: unknown): { date: string; day: number } | null {
  if (typeof meta !== 'object' || meta === null) return null
  const record = meta as Record<string, unknown>
  return typeof record.date === 'string' && typeof record.day === 'number' ? { date: record.date, day: record.day } : null
}

export async function claimAttendance(userId: string, now: Date = new Date()): Promise<AttendanceResult> {
  const amounts = readAttendanceCoins()
  if (!userId || amounts.daily <= 0) return { status: 'off' }
  if (resolveUserCoinBillingMode(userId) !== 'enforce') return { status: 'off' }
  if (!(await isFreeCoinGrantEligible(userId))) return { status: 'off' }

  const today = kstDate(now)
  return withLockedWallet(userId, async (ctx): Promise<AttendanceResult> => {
    const lastLot = await ctx.tx.appCoinLot.findFirst({
      where: { userId, source: ATTENDANCE_SOURCE },
      orderBy: { createdAt: 'desc' },
      select: { meta: true },
    })
    const last = readMark(lastLot?.meta)
    const key = `attendance:${userId}:${today}`
    if (await hasLedgerEntry(ctx, key)) return { status: 'already', day: last?.date === today ? last.day : 1 }

    const day = nextStreakDay(last, today)
    await grantLot(ctx, { source: ATTENDANCE_SOURCE, isFree: true, amountMicro: coinsToMicro(amounts.daily), idempotencyKey: key, meta: { date: today, day } })
    let bonus = 0
    if (day === ATTENDANCE_STREAK_DAYS && amounts.weekBonus > 0) {
      await grantLot(ctx, {
        source: ATTENDANCE_BONUS_SOURCE,
        isFree: true,
        amountMicro: coinsToMicro(amounts.weekBonus),
        idempotencyKey: `attendance-week:${userId}:${today}`,
        meta: { date: today },
      })
      bonus = amounts.weekBonus
    }
    return { status: 'granted', day, coins: amounts.daily, bonus }
  }, { now })
}
