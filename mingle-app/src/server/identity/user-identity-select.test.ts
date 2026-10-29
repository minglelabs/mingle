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
    expect(identityBadgeFlags({ isOfficial: false })).toEqual({})
    expect(identityBadgeFlags({ isOfficial: null })).toEqual({})
    expect(identityBadgeFlags({})).toEqual({})
    expect(identityBadgeFlags(null)).toEqual({})
    expect(identityBadgeFlags(undefined)).toEqual({})
  })

  it('adds the official flag only when it is true', () => {
    expect(identityBadgeFlags({ isOfficial: true })).toEqual({ isOfficial: true })
    expect(Object.keys(identityBadgeFlags({ isOfficial: true }))).toEqual(['isOfficial'])
  })
})
