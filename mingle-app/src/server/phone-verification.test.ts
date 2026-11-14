import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requestCount: vi.fn(),
  requestCreate: vi.fn(),
  userUpdateMany: vi.fn(),
  userUpdate: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    phoneVerificationRequest: { count: mocks.requestCount, create: mocks.requestCreate },
    user: { updateMany: mocks.userUpdateMany, update: mocks.userUpdate },
    $transaction: mocks.transaction,
  },
}))

import {
  PHONE_SIGN_IN_CODES_PER_CLIENT_PER_DAY,
  PHONE_SIGN_IN_CODES_PER_NUMBER_PER_DAY,
  confirmPhoneVerification,
  hashPhoneE164,
  isReviewPhoneNumber,
  resetPhoneSignInLimits,
  startPhoneSignIn,
  startPhoneVerification,
  verifyPhoneSignIn,
} from './phone-verification'

const env = { ...process.env }
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requestCount.mockResolvedValue(0)
  mocks.requestCreate.mockResolvedValue({})
  mocks.userUpdateMany.mockReturnValue('clear-others')
  mocks.userUpdate.mockReturnValue('set-mine')
  mocks.transaction.mockResolvedValue([])
  vi.stubGlobal('fetch', fetchMock)
  delete process.env.TWILIO_ACCOUNT_SID
  delete process.env.TWILIO_AUTH_TOKEN
  delete process.env.TWILIO_VERIFY_SERVICE_SID
  delete process.env.PHONE_VERIFICATION_DEV_CODE
})

afterEach(() => {
  process.env = { ...env }
  vi.unstubAllGlobals()
})

function useTwilio() {
  process.env.TWILIO_ACCOUNT_SID = 'AC1'
  process.env.TWILIO_AUTH_TOKEN = 'tok'
  process.env.TWILIO_VERIFY_SERVICE_SID = 'VA1'
}

describe('startPhoneVerification', () => {
  it('logs the request and sends the code through Twilio Verify', async () => {
    useTwilio()
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }))
    await startPhoneVerification('me', '+821012345678', { locale: 'ko' })
    expect(mocks.requestCreate).toHaveBeenCalledWith({ data: { userId: 'me', phoneE164: '+821012345678' } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://verify.twilio.com/v2/Services/VA1/Verifications')
    expect(String(init.body)).toBe('To=%2B821012345678&Channel=sms&Locale=ko')
  })

  it('refuses a bad number and the sixth code of the day', async () => {
    await expect(startPhoneVerification('me', '010-1234-5678')).rejects.toMatchObject({ code: 'invalid_phone' })
    mocks.requestCount.mockResolvedValueOnce(5).mockResolvedValueOnce(0)
    await expect(startPhoneVerification('me', '+821012345678')).rejects.toMatchObject({ code: 'too_many_requests' })
    expect(mocks.requestCreate).not.toHaveBeenCalled()
  })

  it('is unavailable in production without Twilio', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(startPhoneVerification('me', '+821012345678')).rejects.toMatchObject({ code: 'unavailable' })
    vi.unstubAllEnvs()
  })
})

describe('confirmPhoneVerification', () => {
  it('saves an approved number and takes it off any other account', async () => {
    useTwilio()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'approved' }), { status: 200 }))
    await expect(confirmPhoneVerification('me', '+821012345678', '123 456')).resolves.toEqual({ phoneE164: '+821012345678' })
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { phoneE164: '+821012345678', id: { not: 'me' } },
      data: { phoneE164: null, phoneHash: null, phoneVerifiedAt: null },
    })
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'me' },
      data: expect.objectContaining({ phoneE164: '+821012345678', phoneHash: hashPhoneE164('+821012345678') }),
    })
    expect(mocks.transaction).toHaveBeenCalledWith(['clear-others', 'set-mine'])
  })

  it('rejects a wrong or expired code without saving', async () => {
    useTwilio()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'pending' }), { status: 200 }))
    await expect(confirmPhoneVerification('me', '+821012345678', '000000')).rejects.toMatchObject({ code: 'wrong_code' })
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }))
    await expect(confirmPhoneVerification('me', '+821012345678', '000000')).rejects.toMatchObject({ code: 'wrong_code' })
    await expect(confirmPhoneVerification('me', '+821012345678', '12')).rejects.toMatchObject({ code: 'invalid_code' })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('accepts 000000 on a local server without Twilio', async () => {
    await expect(confirmPhoneVerification('me', '+819012345678', '000000')).resolves.toEqual({ phoneE164: '+819012345678' })
    await expect(confirmPhoneVerification('me', '+819012345678', '111111')).rejects.toMatchObject({ code: 'wrong_code' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sign-in by phone number', () => {
  beforeEach(() => {
    resetPhoneSignInLimits()
    delete process.env.PHONE_REVIEW_LOGINS
  })

  it('needs no account and takes the dev code on a local server', async () => {
    await startPhoneSignIn('+821012345678', { clientKey: '1.2.3.4' })
    expect(mocks.requestCreate).not.toHaveBeenCalled()
    expect(await verifyPhoneSignIn('+821012345678', '000000')).toBe('+821012345678')
    expect(await verifyPhoneSignIn('+821012345678', '111111')).toBeNull()
    expect(await verifyPhoneSignIn('01012345678', '000000')).toBeNull()
  })

  it('caps codes per number and per client address', async () => {
    for (let i = 0; i < PHONE_SIGN_IN_CODES_PER_NUMBER_PER_DAY; i += 1) {
      await startPhoneSignIn('+821011112222', { clientKey: `ip-${i}` })
    }
    await expect(startPhoneSignIn('+821011112222', { clientKey: 'ip-new' })).rejects.toMatchObject({ code: 'too_many_requests' })
    for (let i = 0; i < PHONE_SIGN_IN_CODES_PER_CLIENT_PER_DAY; i += 1) {
      await startPhoneSignIn(`+8210333300${String(i).padStart(2, '0')}`, { clientKey: 'same-ip' })
    }
    await expect(startPhoneSignIn('+821044445555', { clientKey: 'same-ip' })).rejects.toMatchObject({ code: 'too_many_requests' })
  })

  it('texts Korean numbers through Sendon with our own code, others through Twilio', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC'
    process.env.TWILIO_AUTH_TOKEN = 't'
    process.env.TWILIO_VERIFY_SERVICE_SID = 'VA'
    process.env.SENDON_ID = 'id'
    process.env.SENDON_API_KEY = 'k'
    process.env.SENDON_SENDER = '0212345678'
    fetchMock.mockResolvedValue(new Response('{"code":200}', { status: 200 }))
    await startPhoneSignIn('+821055556666', { clientKey: 'a' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sendon.io/v2/messages/sms')
    const text = JSON.parse(fetchMock.mock.calls[0][1].body).message as string
    const code = text.match(/\d{6}/)?.[0] ?? ''
    expect(await verifyPhoneSignIn('+821055556666', '000000' === code ? '111111' : '000000')).toBeNull()
    expect(await verifyPhoneSignIn('+821055556666', code)).toBe('+821055556666')

    fetchMock.mockClear()
    await startPhoneSignIn('+819012345678', { clientKey: 'b' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('verify.twilio.com')
    delete process.env.SENDON_ID
    delete process.env.SENDON_API_KEY
    delete process.env.SENDON_SENDER
  })

  it('lets store reviewers in with a fixed number and code, with Twilio set up', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC'
    process.env.TWILIO_AUTH_TOKEN = 't'
    process.env.TWILIO_VERIFY_SERVICE_SID = 'VA'
    process.env.PHONE_REVIEW_LOGINS = '+821000000000:123456, bad, +15555550100:65-43-21'
    await startPhoneSignIn('+821000000000')
    await startPhoneVerification('me', '+821000000000')
    expect(await verifyPhoneSignIn('+821000000000', '123456')).toBe('+821000000000')
    expect(await verifyPhoneSignIn('+821000000000', '000000')).toBeNull()
    expect(await verifyPhoneSignIn('+15555550100', '654321')).toBe('+15555550100')
    expect(isReviewPhoneNumber('+821099999999')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.requestCreate).not.toHaveBeenCalled()
  })
})
