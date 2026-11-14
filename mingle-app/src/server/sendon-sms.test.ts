import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SMS_CODE_MAX_ATTEMPTS,
  SMS_CODE_TTL_MS,
  buildSendonAuthorization,
  checkSmsCode,
  issueSmsCode,
  readSendonConfig,
  resetSmsCodes,
  sendSendonSms,
  toKoreanDomesticNumber,
} from './sendon-sms'

afterEach(() => {
  resetSmsCodes()
  vi.unstubAllGlobals()
})

const config = { id: 'me', apiKey: 'key', sender: '0212345678' }

describe('Sendon request', () => {
  it('needs the id, the key and a registered sender', () => {
    expect(readSendonConfig({} as NodeJS.ProcessEnv)).toBeNull()
    expect(readSendonConfig({ SENDON_ID: 'me', SENDON_API_KEY: 'key', SENDON_SENDER: '010-1234-5678' } as unknown as NodeJS.ProcessEnv))
      .toEqual({ id: 'me', apiKey: 'key', sender: '01012345678' })
  })

  it('sends Korean numbers in domestic form only', () => {
    expect(toKoreanDomesticNumber('+821012345678')).toBe('01012345678')
    expect(toKoreanDomesticNumber('+819012345678')).toBeNull()
  })

  it('signs in with HTTP Basic id:key', () => {
    expect(buildSendonAuthorization(config)).toBe(`Basic ${Buffer.from('me:key').toString('base64')}`)
  })

  it('posts one plain, non-ad SMS from the sender to the number', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"code":200,"data":{"groupId":"g"}}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await sendSendonSms(config, '+821012345678', 'hi')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.sendon.io/v2/messages/sms')
    expect(JSON.parse(init.body)).toEqual({ type: 'SMS', from: '0212345678', to: ['01012345678'], message: 'hi', isAd: false })
    expect(init.headers.Authorization).toBe(buildSendonAuthorization(config))
  })

  it('treats a failure code inside an HTTP 200 as a refused send', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":401,"message":"허가되지 않은 사용자입니다."}', { status: 200 })))
    await expect(sendSendonSms(config, '+821012345678', 'hi')).rejects.toMatchObject({ code: 401 })
  })
})

describe('SMS codes', () => {
  it('takes the right code once', () => {
    const code = issueSmsCode('+821012345678', 0)
    expect(code).toMatch(/^\d{6}$/)
    expect(checkSmsCode('+821012345678', code, 1000)).toBe(true)
    expect(checkSmsCode('+821012345678', code, 1000)).toBe(false)
  })

  it('expires after five minutes', () => {
    const code = issueSmsCode('+821012345678', 0)
    expect(checkSmsCode('+821012345678', code, SMS_CODE_TTL_MS + 1)).toBe(false)
  })

  it('dies after too many wrong tries, even for the right code', () => {
    const code = issueSmsCode('+821012345678', 0)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < SMS_CODE_MAX_ATTEMPTS; i += 1) expect(checkSmsCode('+821012345678', wrong, 10)).toBe(false)
    expect(checkSmsCode('+821012345678', code, 10)).toBe(false)
  })

  it('keeps only the latest code for a number', () => {
    const first = issueSmsCode('+821012345678', 0)
    const second = issueSmsCode('+821012345678', 0)
    if (first !== second) expect(checkSmsCode('+821012345678', first, 1)).toBe(false)
    expect(checkSmsCode('+821012345678', second, 1)).toBe(true)
  })

  it('fits the code text in one SMS (90 bytes)', async () => {
    const { buildSmsCodeText } = await import('./sendon-sms')
    const text = buildSmsCodeText('123456')
    const bytes = [...text].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0)
    expect(bytes).toBeLessThanOrEqual(90)
  })
})
