import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSendonAuthorization, readSendonConfig, sendSendonSms } from './sendon-sms'

afterEach(() => {
  vi.unstubAllGlobals()
})

const config = { id: 'me', apiKey: 'key', sender: '0212345678' }

describe('Sendon request', () => {
  it('needs the id, the key and a registered sender', () => {
    expect(readSendonConfig({} as NodeJS.ProcessEnv)).toBeNull()
    expect(readSendonConfig({ SENDON_ID: 'me', SENDON_API_KEY: 'key', SENDON_SENDER: '010-1234-5678' } as unknown as NodeJS.ProcessEnv))
      .toEqual({ id: 'me', apiKey: 'key', sender: '01012345678' })
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
