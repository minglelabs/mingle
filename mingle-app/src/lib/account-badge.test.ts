import { describe, expect, it } from 'vitest'
import { resolveAccountBadge, withAccountBadgeLabel } from './account-badge'

describe('resolveAccountBadge', () => {
  it('labels operator accounts, then official accounts, else nothing', () => {
    expect(resolveAccountBadge({ isOperator: true })).toBe('operator')
    expect(resolveAccountBadge({ isOfficial: true })).toBe('official')
    expect(resolveAccountBadge({ isOfficial: false, isOperator: false })).toBeNull()
    expect(resolveAccountBadge({ isOfficial: null, isOperator: null })).toBeNull()
    expect(resolveAccountBadge({})).toBeNull()
    expect(resolveAccountBadge(null)).toBeNull()
    expect(resolveAccountBadge(undefined)).toBeNull()
  })

  it('lets the operator label win if a row ever carries both flags', () => {
    expect(resolveAccountBadge({ isOfficial: true, isOperator: true })).toBe('operator')
  })
})

describe('withAccountBadgeLabel', () => {
  it('appends the operator label in Korean and English', () => {
    expect(withAccountBadgeLabel('Mina', 'operator', 'ko')).toBe('Mina (운영 계정)')
    expect(withAccountBadgeLabel('Mina', 'operator', 'en')).toBe('Mina (Run by Mingle)')
  })

  it('appends the official label in Korean and English', () => {
    expect(withAccountBadgeLabel('Mingle', 'official', 'ko')).toBe('Mingle (공식)')
    expect(withAccountBadgeLabel('Mingle', 'official', 'en')).toBe('Mingle (Official)')
  })

  it('resolves region tags and falls back to English for an unknown language', () => {
    expect(withAccountBadgeLabel('Mina', 'operator', 'ko-KR')).toBe('Mina (운영 계정)')
    expect(withAccountBadgeLabel('Mina', 'operator', 'xx')).toBe('Mina (Run by Mingle)')
    expect(withAccountBadgeLabel('Mina', 'operator', '')).toBe('Mina (Run by Mingle)')
  })

  it('leaves the name of an account without a badge unchanged', () => {
    expect(withAccountBadgeLabel('Mina', null, 'ko')).toBe('Mina')
    expect(withAccountBadgeLabel('@mina', undefined, 'en')).toBe('@mina')
  })
})
