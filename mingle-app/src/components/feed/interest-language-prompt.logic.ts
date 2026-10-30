/**
 * When the feed asks a user who has no 관심 언어 yet (someone who joined
 * before onboarding asked for it): after a short look at the feed, at most
 * twice, the second time a week after the first. Kept per user in this
 * browser; a lost record only means one more ask.
 */
export const INTEREST_PROMPT_DELAY_MS = 8_000
export const INTEREST_PROMPT_MAX_SHOWS = 2
export const INTEREST_PROMPT_GAP_MS = 7 * 24 * 60 * 60 * 1000

export type InterestPromptRecord = { count: number; lastShownAt: number }

export function interestPromptStorageKey(userId: string): string {
  return `hashchat.interestLanguagePrompt.v1:${userId}`
}

export function parseInterestPromptRecord(raw: string | null): InterestPromptRecord {
  try {
    const value = raw ? JSON.parse(raw) as Partial<InterestPromptRecord> : null
    const count = Number.isInteger(value?.count) && (value?.count ?? 0) > 0 ? value!.count! : 0
    const lastShownAt = typeof value?.lastShownAt === 'number' && Number.isFinite(value.lastShownAt) ? value.lastShownAt : 0
    return { count, lastShownAt }
  } catch {
    return { count: 0, lastShownAt: 0 }
  }
}

export function shouldShowInterestPrompt(record: InterestPromptRecord, now: number): boolean {
  if (record.count >= INTEREST_PROMPT_MAX_SHOWS) return false
  return record.count === 0 || now - record.lastShownAt >= INTEREST_PROMPT_GAP_MS
}

export function recordInterestPromptShown(record: InterestPromptRecord, now: number): InterestPromptRecord {
  return { count: record.count + 1, lastShownAt: now }
}
