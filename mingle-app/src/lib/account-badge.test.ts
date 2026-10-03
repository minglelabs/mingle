import { describe, expect, it } from 'vitest'
import { resolveAccountBadge, withAccountBadgeLabel } from './account-badge'

describe('resolveAccountBadge', () => {
  it('labels official accounts, else nothing', () => {
    expect(resolveAccountBadge({ isOfficial: true })).toBe('official')
    expect(resolveAccountBadge({ isOfficial: false })).toBeNull()
    expect(resolveAccountBadge({ isOfficial: null })).toBeNull()
    expect(resolveAccountBadge({})).toBeNull()
    expect(resolveAccountBadge(null)).toBeNull()
    expect(resolveAccountBadge(undefined)).toBeNull()
  })
})

describe('withAccountBadgeLabel', () => {
  it('appends the official label in Korean and English', () => {
    expect(withAccountBadgeLabel('Mingle', 'official', 'ko')).toBe('Mingle (공식)')
    expect(withAccountBadgeLabel('Mingle', 'official', 'en')).toBe('Mingle (Official)')
  })

  it('resolves region tags and falls back to English for an unknown language', () => {
    expect(withAccountBadgeLabel('Mingle', 'official', 'ko-KR')).toBe('Mingle (공식)')
    expect(withAccountBadgeLabel('Mingle', 'official', 'xx')).toBe('Mingle (Official)')
    expect(withAccountBadgeLabel('Mingle', 'official', '')).toBe('Mingle (Official)')
  })

  it('leaves the name of an account without a badge unchanged', () => {
    expect(withAccountBadgeLabel('Mina', null, 'ko')).toBe('Mina')
    expect(withAccountBadgeLabel('@mina', undefined, 'en')).toBe('@mina')
  })
})
