import { describe, expect, it } from 'vitest'
import {
  registerProfileBasicsHandler,
  requestProfileBasics,
  resolveMissingProfileBasics,
} from '@/lib/profile-basics'

describe('resolveMissingProfileBasics', () => {
  it('asks for both on a profile from the short onboarding (height too, shown only if "male" is picked)', () => {
    expect(resolveMissingProfileBasics({ gender: null, birthDate: null })).toEqual(['gender', 'birth-date', 'height'])
    expect(resolveMissingProfileBasics({})).toEqual(['gender', 'birth-date', 'height'])
  })

  it('asks only for what is missing', () => {
    expect(resolveMissingProfileBasics({ gender: 'female', birthDate: null })).toEqual(['birth-date'])
    expect(resolveMissingProfileBasics({ gender: null, birthDate: '2000-01-01' })).toEqual(['gender', 'height'])
  })

  it('asks nothing of a complete profile, or when the profile could not be read', () => {
    expect(resolveMissingProfileBasics({ gender: 'male', birthDate: '1999-05-05', heightCm: 180 })).toEqual([])
    expect(resolveMissingProfileBasics({ gender: 'female', birthDate: '1999-05-05' })).toEqual([])
    expect(resolveMissingProfileBasics(null)).toEqual([])
  })
})

describe('requestProfileBasics', () => {
  it('never blocks an action when no gate is mounted', async () => {
    await expect(requestProfileBasics()).resolves.toBe(true)
  })

  it('asks the mounted gate, and stops asking once it unmounts', async () => {
    const unregister = registerProfileBasicsHandler(async () => false)
    await expect(requestProfileBasics()).resolves.toBe(false)
    unregister()
    await expect(requestProfileBasics()).resolves.toBe(true)
  })
})
