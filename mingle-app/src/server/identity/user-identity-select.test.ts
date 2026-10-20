import { describe, expect, it } from 'vitest'
import { USER_IDENTITY_SELECT, identityBadgeFlags } from './user-identity-select'

describe('USER_IDENTITY_SELECT', () => {
  it('selects the identity fields and both badge flags', () => {
    expect(USER_IDENTITY_SELECT).toEqual({
      id: true,
      handle: true,
      name: true,
      image: true,
      imageCropScale: true,
      imageCropX: true,
      imageCropY: true,
      isOfficial: true,
      isOperator: true,
    })
  })
})

describe('identityBadgeFlags', () => {
  it('adds nothing for an ordinary user', () => {
    expect(identityBadgeFlags({ isOfficial: false, isOperator: false })).toEqual({})
    expect(identityBadgeFlags({ isOfficial: null, isOperator: null })).toEqual({})
    expect(identityBadgeFlags({})).toEqual({})
    expect(identityBadgeFlags(null)).toEqual({})
    expect(identityBadgeFlags(undefined)).toEqual({})
  })

  it('adds each flag only when it is true', () => {
    expect(identityBadgeFlags({ isOfficial: true, isOperator: false })).toEqual({ isOfficial: true })
    expect(identityBadgeFlags({ isOfficial: false, isOperator: true })).toEqual({ isOperator: true })
    expect(Object.keys(identityBadgeFlags({ isOperator: true }))).toEqual(['isOperator'])
    expect(Object.keys(identityBadgeFlags({ isOfficial: true }))).toEqual(['isOfficial'])
  })
})
