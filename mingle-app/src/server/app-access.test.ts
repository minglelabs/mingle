import { describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: db.findUnique, updateMany: db.updateMany } } }))
vi.mock('@/server/referral', () => ({ ReferralError: class extends Error {}, redeemReferralCode: vi.fn() }))

import { isReviewAccount, readAppAccess, resolveAppAccess } from '@/server/app-access'

const newUser = {
  createdAt: new Date('2026-12-01T00:00:00Z'),
  referredByUserId: null,
  isOperator: false,
  isOfficial: false,
  phoneE164: '+821012345678',
  email: null,
}
const gate = { INVITE_GATE: 'on', INVITE_GATE_SINCE: '2026-11-20T00:00:00Z' } as unknown as NodeJS.ProcessEnv

describe('invite gate', () => {
  it('lets everyone in while it is off', () => {
    expect(resolveAppAccess(newUser, {} as NodeJS.ProcessEnv)).toEqual({ allowed: true, reason: 'gate_off' })
  })

  it('asks a new account without an invite for one', () => {
    expect(resolveAppAccess(newUser, gate)).toEqual({ allowed: false, reason: 'needs_invite' })
  })

  it('lets in invited, earlier and staff accounts', () => {
    expect(resolveAppAccess({ ...newUser, referredByUserId: 'u1' }, gate).reason).toBe('invited')
    expect(resolveAppAccess({ ...newUser, createdAt: new Date('2026-11-01T00:00:00Z') }, gate).reason).toBe('existing')
    expect(resolveAppAccess({ ...newUser, isOperator: true }, gate).reason).toBe('staff')
  })

  it('keeps a waitlisted account out until an admin lets it in', () => {
    const waiting = { ...newUser, waitlistedAt: new Date('2026-12-02T00:00:00Z') }
    expect(resolveAppAccess(waiting, gate)).toEqual({ allowed: false, reason: 'waitlisted' })
    expect(resolveAppAccess({ ...waiting, accessGrantedAt: new Date('2026-12-03T00:00:00Z') }, gate))
      .toEqual({ allowed: true, reason: 'granted' })
  })

  it('asks only people using the app in Korean, by default', () => {
    expect(resolveAppAccess(newUser, gate, 'ko').reason).toBe('needs_invite')
    expect(resolveAppAccess(newUser, gate, 'ko-KR').reason).toBe('needs_invite')
    expect(resolveAppAccess(newUser, gate, 'en')).toEqual({ allowed: true, reason: 'other_locale' })
    expect(resolveAppAccess(newUser, gate, 'ja').reason).toBe('other_locale')
    // No language sent: gated, so an old app cannot slip past.
    expect(resolveAppAccess(newUser, gate, null).reason).toBe('needs_invite')
  })

  it('follows INVITE_GATE_LOCALES, where * means every language', () => {
    const jaToo = { ...gate, INVITE_GATE_LOCALES: 'ko, ja' } as unknown as NodeJS.ProcessEnv
    expect(resolveAppAccess(newUser, jaToo, 'ja').reason).toBe('needs_invite')
    expect(resolveAppAccess(newUser, jaToo, 'en').reason).toBe('other_locale')
    const everyone = { ...gate, INVITE_GATE_LOCALES: '*' } as unknown as NodeJS.ProcessEnv
    expect(resolveAppAccess(newUser, everyone, 'en').reason).toBe('needs_invite')
  })

  it('never asks a store reviewer for an invite', () => {
    const env = { ...gate, PHONE_REVIEW_LOGINS: '+821000000000:123456', REVIEW_ACCOUNT_EMAILS: 'Review@HashChat.app' } as unknown as NodeJS.ProcessEnv
    expect(resolveAppAccess({ ...newUser, phoneE164: '+821000000000' }, env).reason).toBe('review')
    expect(isReviewAccount({ phoneE164: null, email: 'review@hashchat.app' }, env)).toBe(true)
    expect(isReviewAccount({ phoneE164: '+821012345678', email: 'other@hashchat.app' }, env)).toBe(false)
  })
})

describe('waitlist', () => {
  it('puts an account the gate stops on the waitlist by itself', async () => {
    vi.stubEnv('INVITE_GATE', 'on')
    vi.stubEnv('INVITE_GATE_SINCE', '2026-11-20T00:00:00Z')
    db.findUnique.mockResolvedValue({ ...newUser, waitlistedAt: null, accessGrantedAt: null })
    db.updateMany.mockResolvedValue({ count: 1 })
    await expect(readAppAccess('u-new', 'ko')).resolves.toEqual({ allowed: false, reason: 'waitlisted' })
    expect(db.updateMany).toHaveBeenCalledWith({ where: { id: 'u-new', waitlistedAt: null }, data: { waitlistedAt: expect.any(Date) } })

    db.updateMany.mockClear()
    db.findUnique.mockResolvedValue({ ...newUser, referredByUserId: 'u1' })
    await expect(readAppAccess('u-invited', 'ko')).resolves.toEqual({ allowed: true, reason: 'invited' })
    expect(db.updateMany).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
