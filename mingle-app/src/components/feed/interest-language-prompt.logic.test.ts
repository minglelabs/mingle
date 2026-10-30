import { describe, expect, it } from 'vitest'
import {
  INTEREST_PROMPT_GAP_MS,
  parseInterestPromptRecord,
  recordInterestPromptShown,
  shouldShowInterestPrompt,
} from './interest-language-prompt.logic'

describe('interest language prompt gate', () => {
  it('asks the first time, again only a week later, then never', () => {
    const now = 1_000_000_000
    let record = parseInterestPromptRecord(null)
    expect(shouldShowInterestPrompt(record, now)).toBe(true)
    record = recordInterestPromptShown(record, now)
    expect(shouldShowInterestPrompt(record, now + INTEREST_PROMPT_GAP_MS - 1)).toBe(false)
    expect(shouldShowInterestPrompt(record, now + INTEREST_PROMPT_GAP_MS)).toBe(true)
    record = recordInterestPromptShown(record, now + INTEREST_PROMPT_GAP_MS)
    expect(shouldShowInterestPrompt(record, now + 10 * INTEREST_PROMPT_GAP_MS)).toBe(false)
  })

  it('reads a broken record as never asked', () => {
    expect(parseInterestPromptRecord('{oops')).toEqual({ count: 0, lastShownAt: 0 })
    expect(parseInterestPromptRecord('{"count":-1,"lastShownAt":"x"}')).toEqual({ count: 0, lastShownAt: 0 })
  })
})
