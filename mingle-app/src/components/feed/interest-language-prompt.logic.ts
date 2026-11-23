/**
 * When the feed asks a user who has no 관심 언어 yet (someone who joined
 * before onboarding asked for it): after a short look at the feed, at most
 * twice, the second time a week after the first. Kept per user in this
 * browser; a lost record only means one more ask.
 */
export const INTEREST_PROMPT_DELAY_MS = 8_000
export const INTEREST_PROMPT_MAX_SHOWS = 2
export const INTEREST_PROMPT_GAP_MS = 7 * 24 * 60 * 60 * 1000
/**
 * Not on a new account's first day here (owner, 2026-11-23): Home is the feed
 * again, so a new account met this question seconds after signing up. The day
 * starts when this browser first saw the account on the feed.
 */
export const INTEREST_PROMPT_SETTLE_MS = 24 * 60 * 60 * 1000

/** `firstSeenAt`: when the feed first saw this account here (0: not yet). */
export type InterestPromptRecord = { count: number; lastShownAt: number; firstSeenAt: number }

export function interestPromptStorageKey(userId: string): string {
  return `hashchat.interestLanguagePrompt.v1:${userId}`
}

export function parseInterestPromptRecord(raw: string | null): InterestPromptRecord {
  try {
    const value = raw ? JSON.parse(raw) as Partial<InterestPromptRecord> : null
    const count = Number.isInteger(value?.count) && (value?.count ?? 0) > 0 ? value!.count! : 0
    const lastShownAt = typeof value?.lastShownAt === 'number' && Number.isFinite(value.lastShownAt) ? value.lastShownAt : 0
    const firstSeenAt = typeof value?.firstSeenAt === 'number' && Number.isFinite(value.firstSeenAt) ? value.firstSeenAt : 0
    return { count, lastShownAt, firstSeenAt }
  } catch {
    return { count: 0, lastShownAt: 0, firstSeenAt: 0 }
  }
}

/** Starts the first-day clock the first time the feed sees this account. */
export function withFirstSeen(record: InterestPromptRecord, now: number): InterestPromptRecord {
  return record.firstSeenAt > 0 ? record : { ...record, firstSeenAt: now }
}

export function shouldShowInterestPrompt(
  record: InterestPromptRecord,
  now: number,
  options: { firstSpeakPending?: boolean } = {},
): boolean {
  if (options.firstSpeakPending) return false
  if (record.firstSeenAt <= 0 || now - record.firstSeenAt < INTEREST_PROMPT_SETTLE_MS) return false
  if (record.count >= INTEREST_PROMPT_MAX_SHOWS) return false
  return record.count === 0 || now - record.lastShownAt >= INTEREST_PROMPT_GAP_MS
}

export function recordInterestPromptShown(record: InterestPromptRecord, now: number): InterestPromptRecord {
  return { ...record, count: record.count + 1, lastShownAt: now }
}
