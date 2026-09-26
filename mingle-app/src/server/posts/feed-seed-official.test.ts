import { describe, expect, it } from 'vitest'
import { parseSeedArgs, planMarkOfficial } from '../../../scripts/seed-feed-content.logic'

describe('seed --mark-official (official account badge, spec 84)', () => {
  it('is off by default and stays a dry-run unless --apply is given', () => {
    expect(parseSeedArgs([]).markOfficial).toBe(false)
    const dry = parseSeedArgs(['--mark-official'])
    expect(dry.markOfficial).toBe(true)
    expect(dry.apply).toBe(false)
    const applied = parseSeedArgs(['--mark-official', '--apply', '--author-user-id', 'user_1'])
    expect(applied).toMatchObject({ markOfficial: true, apply: true, authorUserId: 'user_1' })
  })

  it('refuses combinations that cannot mark an existing account', () => {
    expect(() => parseSeedArgs(['--mark-official', '--no-db'])).toThrow(/--no-db/)
    expect(() => parseSeedArgs(['--mark-official', '--create-author'])).toThrow(/--create-author/)
  })

  it('plans the flag change from the resolved account only', () => {
    expect(planMarkOfficial(null)).toBe('not-found')
    expect(planMarkOfficial({ isOfficial: true })).toBe('already-official')
    expect(planMarkOfficial({ isOfficial: false })).toBe('mark')
  })
})
