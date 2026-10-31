import { describe, expect, it, vi } from 'vitest'
import { chatgptPoolChat, chatgptPoolImage } from './client'

const env = { CHATGPT_POOL_KEY: 'test-key' } as unknown as NodeJS.ProcessEnv
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const sleep = vi.fn(async () => {})

function clock() {
  let t = 0
  return { now: () => t, sleep: vi.fn(async (ms: number) => { t += ms }) }
}

describe('chatgptPoolChat', () => {
  it('sends chatgpt-web with the bearer key and returns the answer and account', async () => {
    const fetchImpl = vi.fn(async () => json({ choices: [{ message: { content: '안녕' } }], account: 'a@x', profile: 'Profile 1' }))
    const result = await chatgptPoolChat('hi', { env, fetchImpl: fetchImpl as unknown as typeof fetch, sleep })
    expect(result).toEqual({ ok: true, content: '안녕', account: 'a@x', profile: 'Profile 1' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://chatgpt-pool.minglelabs.app/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json; charset=utf-8')
    expect(JSON.parse(String(init.body))).toEqual({ model: 'chatgpt-web', messages: [{ role: 'user', content: 'hi' }] })
  })

  it('does not call the pool without a key', async () => {
    const fetchImpl = vi.fn()
    const result = await chatgptPoolChat('hi', { env: {} as NodeJS.ProcessEnv, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'missing_key' }) })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('retries a 502 once', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ error: { code: 'chat_failed' } }, 502))
      .mockResolvedValueOnce(json({ choices: [{ message: { content: 'ok' } }] }))
    const result = await chatgptPoolChat('hi', { env, fetchImpl: fetchImpl as unknown as typeof fetch, sleep })
    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it.each([[429, 'image_limit'], [503, 'no_account']])('never retries %s', async (status, code) => {
    const fetchImpl = vi.fn(async () => json({ error: { code, message: 'm' } }, status))
    const result = await chatgptPoolChat('hi', { env, fetchImpl: fetchImpl as unknown as typeof fetch, sleep })
    expect(result).toEqual({ ok: false, error: { status, code, message: 'm' } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('chatgptPoolImage', () => {
  it('submits async, polls every 10s and decodes the PNG', async () => {
    const c = clock()
    const png = Buffer.from('png-bytes').toString('base64')
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ id: 'job_1', status: 'pending' }, 202))
      .mockResolvedValueOnce(json({ status: 'pending' }))
      .mockResolvedValueOnce(json({ status: 'done', result: { data: [{ b64_json: png }], account: 'a@x', profile: 'P' } }))
    const result = await chatgptPoolImage('tteokbokki', { env, fetchImpl: fetchImpl as unknown as typeof fetch, ...c })
    expect(result).toEqual({ ok: true, bytes: Buffer.from('png-bytes'), account: 'a@x', profile: 'P' })
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ prompt: 'tteokbokki', async: true })
    expect(fetchImpl.mock.calls[1][0]).toBe('https://chatgpt-pool.minglelabs.app/v1/jobs/job_1')
    expect(c.sleep).toHaveBeenCalledWith(10_000)
  })

  it('reports a job error without retrying a refusal', async () => {
    const c = clock()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ id: 'job_1' }, 202))
      .mockResolvedValueOnce(json({ status: 'error', error: { status: 422, code: 'image_refused', message: 'no' } }))
    const result = await chatgptPoolImage('p', { env, fetchImpl: fetchImpl as unknown as typeof fetch, ...c })
    expect(result).toEqual({ ok: false, error: { status: 422, code: 'image_refused', message: 'no' } })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('gives up after 8 minutes and then retries the whole job once', async () => {
    const c = clock()
    const fetchImpl = vi.fn(async (url: string) => (url.endsWith('/generations') ? json({ id: 'job_1' }, 202) : json({ status: 'pending' })))
    const result = await chatgptPoolImage('p', { env, fetchImpl: fetchImpl as unknown as typeof fetch, ...c })
    expect(result).toEqual({ ok: false, error: { status: 0, code: 'timeout' } })
    const submits = fetchImpl.mock.calls.filter((call) => String(call[0]).endsWith('/generations'))
    expect(submits).toHaveLength(2)
  })

  it('submits again once when the job is lost (404 job_not_found)', async () => {
    const c = clock()
    const png = Buffer.from('x').toString('base64')
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ id: 'job_1' }, 202))
      .mockResolvedValueOnce(json({ error: { code: 'job_not_found' } }, 404))
      .mockResolvedValueOnce(json({ id: 'job_2' }, 202))
      .mockResolvedValueOnce(json({ status: 'done', result: { data: [{ b64_json: png }] } }))
    const result = await chatgptPoolImage('p', { env, fetchImpl: fetchImpl as unknown as typeof fetch, ...c })
    expect(result.ok).toBe(true)
  })

  it('does not retry 429', async () => {
    const fetchImpl = vi.fn(async () => json({ error: { code: 'image_limit' } }, 429))
    const result = await chatgptPoolImage('p', { env, fetchImpl: fetchImpl as unknown as typeof fetch, sleep })
    expect(result).toEqual({ ok: false, error: { status: 429, code: 'image_limit', message: undefined } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
