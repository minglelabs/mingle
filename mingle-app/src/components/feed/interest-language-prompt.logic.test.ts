import { describe, expect, it } from 'vitest'
import {
  INTEREST_PROMPT_GAP_MS,
  INTEREST_PROMPT_SETTLE_MS,
  parseInterestPromptRecord,
  recordInterestPromptShown,
  shouldShowInterestPrompt,
  withFirstSeen,
} from './interest-language-prompt.logic'

describe('interest language prompt gate', () => {
  it('asks the first time, again only a week later, then never', () => {
    const firstSeen = 1_000_000_000
    const now = firstSeen + INTEREST_PROMPT_SETTLE_MS
    let record = withFirstSeen(parseInterestPromptRecord(null), firstSeen)
    expect(shouldShowInterestPrompt(record, now)).toBe(true)
    record = recordInterestPromptShown(record, now)
    expect(shouldShowInterestPrompt(record, now + INTEREST_PROMPT_GAP_MS - 1)).toBe(false)
    expect(shouldShowInterestPrompt(record, now + INTEREST_PROMPT_GAP_MS)).toBe(true)
    record = recordInterestPromptShown(record, now + INTEREST_PROMPT_GAP_MS)
    expect(shouldShowInterestPrompt(record, now + 10 * INTEREST_PROMPT_GAP_MS)).toBe(false)
  })

  it('never asks on a new account\'s first day here, nor while its first "say something" is pending', () => {
    const firstSeen = 2_000_000_000
    const record = withFirstSeen(parseInterestPromptRecord(null), firstSeen)
    expect(shouldShowInterestPrompt(parseInterestPromptRecord(null), firstSeen)).toBe(false)
    expect(shouldShowInterestPrompt(record, firstSeen + 8_000)).toBe(false)
    expect(shouldShowInterestPrompt(record, firstSeen + INTEREST_PROMPT_SETTLE_MS - 1)).toBe(false)
    expect(shouldShowInterestPrompt(record, firstSeen + INTEREST_PROMPT_SETTLE_MS, { firstSpeakPending: true })).toBe(false)
    expect(shouldShowInterestPrompt(record, firstSeen + INTEREST_PROMPT_SETTLE_MS)).toBe(true)
    // The first sighting is kept, not moved by later visits.
    expect(withFirstSeen(record, firstSeen + 999).firstSeenAt).toBe(firstSeen)
  })

  it('reads a broken record as never asked', () => {
    expect(parseInterestPromptRecord('{oops')).toEqual({ count: 0, lastShownAt: 0, firstSeenAt: 0 })
    expect(parseInterestPromptRecord('{"count":-1,"lastShownAt":"x"}')).toEqual({ count: 0, lastShownAt: 0, firstSeenAt: 0 })
  })
})
