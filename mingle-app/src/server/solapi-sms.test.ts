import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSolapiAuthorization, readSolapiConfig, sendSolapiSms } from './solapi-sms'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Solapi request', () => {
  it('needs the key, the secret and a registered sender', () => {
    expect(readSolapiConfig({} as NodeJS.ProcessEnv)).toBeNull()
    expect(readSolapiConfig({ SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's', SOLAPI_SENDER: '010-1234-5678' } as unknown as NodeJS.ProcessEnv))
      .toEqual({ apiKey: 'k', apiSecret: 's', sender: '01012345678' })
  })

  it('signs the date and salt with the secret', () => {
    const header = buildSolapiAuthorization({ apiKey: 'KEY', apiSecret: 'SECRET' }, '2026-11-13T00:00:00.000Z', 'abc')
    const signature = createHmac('sha256', 'SECRET').update('2026-11-13T00:00:00.000Zabc').digest('hex')
    expect(header).toBe(`HMAC-SHA256 apiKey=KEY, date=2026-11-13T00:00:00.000Z, salt=abc, signature=${signature}`)
  })

  it('posts one message from the sender to the number', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await sendSolapiSms({ apiKey: 'k', apiSecret: 's', sender: '0212345678' }, '+821012345678', 'hi')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.solapi.com/messages/v4/send')
    expect(JSON.parse(init.body)).toEqual({ message: { to: '01012345678', from: '0212345678', text: 'hi' } })
    expect(init.headers.Authorization).toMatch(/^HMAC-SHA256 apiKey=k, date=.+, salt=[0-9a-f]{32}, signature=[0-9a-f]{64}$/)
  })

  it('reports a refused send with its status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"errorCode":"ValidationError"}', { status: 400 })))
    await expect(sendSolapiSms({ apiKey: 'k', apiSecret: 's', sender: '0212345678' }, '+821012345678', 'hi'))
      .rejects.toMatchObject({ status: 400, errorCode: 'ValidationError' })
  })
})
