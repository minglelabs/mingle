import { describe, expect, it } from 'vitest'
import { trashDaysLeft, TRASH_RETENTION_DAYS } from './trash-retention'

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 0, 31)

describe('trashDaysLeft', () => {
  it('returns full retention when just deleted', () => {
    expect(trashDaysLeft(new Date(now).toISOString(), now)).toBe(TRASH_RETENTION_DAYS)
  })

  it('counts down whole days elapsed', () => {
    expect(trashDaysLeft(new Date(now - 5 * DAY).toISOString(), now)).toBe(25)
    expect(trashDaysLeft(new Date(now - 29 * DAY).toISOString(), now)).toBe(1)
  })

  it('clamps to zero once retention has passed', () => {
    expect(trashDaysLeft(new Date(now - 30 * DAY).toISOString(), now)).toBe(0)
    expect(trashDaysLeft(new Date(now - 45 * DAY).toISOString(), now)).toBe(0)
  })

  it('falls back to full retention for null or invalid input', () => {
    expect(trashDaysLeft(null, now)).toBe(TRASH_RETENTION_DAYS)
    expect(trashDaysLeft('not-a-date', now)).toBe(TRASH_RETENTION_DAYS)
  })
})
