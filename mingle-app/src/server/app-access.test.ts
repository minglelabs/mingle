import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/referral', () => ({ ReferralError: class extends Error {}, redeemReferralCode: vi.fn() }))

import { isReviewAccount, resolveAppAccess } from '@/server/app-access'

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

  it('never asks a store reviewer for an invite', () => {
    const env = { ...gate, PHONE_REVIEW_LOGINS: '+821000000000:123456', REVIEW_ACCOUNT_EMAILS: 'Review@HashChat.app' } as unknown as NodeJS.ProcessEnv
    expect(resolveAppAccess({ ...newUser, phoneE164: '+821000000000' }, env).reason).toBe('review')
    expect(isReviewAccount({ phoneE164: null, email: 'review@hashchat.app' }, env)).toBe(true)
    expect(isReviewAccount({ phoneE164: '+821012345678', email: 'other@hashchat.app' }, env)).toBe(false)
  })
})
