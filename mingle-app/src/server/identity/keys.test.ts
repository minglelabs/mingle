import { describe, expect, it } from 'vitest'
import { identityKeyHash, identityMethodForProvider, isDeviceLinkOn, isStrongDeviceKeyKind } from './keys'

const env = { IDENTITY_HASH_SECRET: 's1' } as unknown as NodeJS.ProcessEnv

describe('identity keys', () => {
  it('hashes with the secret, apart per kind, and never returns the value', () => {
    const phone = identityKeyHash('phone', '+821012345678', env)
    expect(phone).toMatch(/^[0-9a-f]{64}$/)
    expect(phone).toBe(identityKeyHash('phone', ' +821012345678 ', env))
    expect(phone).not.toBe(identityKeyHash('device', '+821012345678', env))
    expect(phone).not.toBe(identityKeyHash('phone', '+821012345678', { IDENTITY_HASH_SECRET: 's2' } as unknown as NodeJS.ProcessEnv))
  })

  it('treats an e-mail the same in any letter case', () => {
    expect(identityKeyHash('email', 'A@B.com', env)).toBe(identityKeyHash('email', 'a@b.com', env))
  })

  it('decides only by device values that survive a reinstall', () => {
    expect(isStrongDeviceKeyKind('keychain')).toBe(true)
    expect(isStrongDeviceKeyKind('android_id')).toBe(true)
    expect(isStrongDeviceKeyKind('web_local')).toBe(false)
    expect(isStrongDeviceKeyKind('push_installation')).toBe(false)
    expect(isStrongDeviceKeyKind(null)).toBe(false)
  })

  it('names only Apple and Google as OAuth methods, and reads the off switch', () => {
    expect(identityMethodForProvider('Google')).toBe('google')
    expect(identityMethodForProvider('native-bridge')).toBeNull()
    expect(isDeviceLinkOn({} as NodeJS.ProcessEnv)).toBe(true)
    expect(isDeviceLinkOn({ DEVICE_LINK: 'off' } as unknown as NodeJS.ProcessEnv)).toBe(false)
  })
})
