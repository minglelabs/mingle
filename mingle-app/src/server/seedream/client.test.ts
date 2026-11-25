import { describe, expect, it, vi } from 'vitest'
import { parseImageEngine, requestSeedreamImage, seedreamBody } from './client'

const env = { SEEDREAM_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv

describe('seedream client', () => {
  it('needs a key', async () => {
    expect(await requestSeedreamImage('p', { env: {} as NodeJS.ProcessEnv })).toEqual({ ok: false, error: 'seedream_unconfigured' })
  })

  it('sends one reference as a data URI, 3:4, no watermark, base64 back', () => {
    const body = seedreamBody('p', [{ bytes: Buffer.from('x'), mimeType: 'image/JPEG' }], 'm')
    expect(body).toMatchObject({ model: 'm', prompt: 'p', image: 'data:image/jpeg;base64,eA==', size: '1728x2304', watermark: false, response_format: 'b64_json' })
    expect(seedreamBody('p', [], 'm')).not.toHaveProperty('image')
  })

  it('returns the drawn bytes', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('img').toString('base64') }] }))) as unknown as typeof fetch
    const drawn = await requestSeedreamImage('p', { env, fetchImpl })
    expect(drawn.ok && drawn.bytes.toString()).toBe('img')
    expect(drawn.ok && drawn.model).toBe('dola-seedream-5-5-261028')
  })

  it('maps a sensitive-content error to a refusal', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'OutputImageSensitiveContentDetected' } }), { status: 400 })) as unknown as typeof fetch
    expect(await requestSeedreamImage('p', { env, fetchImpl })).toMatchObject({ ok: false, error: 'image_refused' })
  })

  it('only seedream picks seedream', () => {
    expect(parseImageEngine('seedream')).toBe('seedream')
    expect(parseImageEngine('x')).toBe('pool')
  })
})
