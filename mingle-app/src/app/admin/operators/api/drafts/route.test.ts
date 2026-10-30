import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  generatePersonaDrafts: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/admin/guard', () => ({ requireAdminApi: mocks.requireAdminApi }))
vi.mock('@/server/operators/persona-draft', async importOriginal => ({
  ...(await importOriginal<typeof import('@/server/operators/persona-draft')>()),
  generatePersonaDrafts: mocks.generatePersonaDrafts,
}))

import { LlmError } from '@/server/llm/generate-json'
import { POST } from './route'

function call(body: unknown) {
  return POST(new Request('https://example.com/admin/operators/api/drafts', { method: 'POST', body: JSON.stringify(body) }))
}

const BODY = { count: 2, countries: ['JP'], ageMin: 22, ageMax: 30 }

describe('POST /admin/operators/api/drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApi.mockResolvedValue({ ok: true, ctx: { sessionId: null, ip: null, userAgent: null } })
  })

  it('requires an admin session', async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    expect((await call(BODY)).status).toBe(401)
    expect(mocks.generatePersonaDrafts).not.toHaveBeenCalled()
  })

  it('validates the settings before calling the model', async () => {
    const response = await call({ ...BODY, ageMin: 18 })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_age_range' })
    expect(mocks.generatePersonaDrafts).not.toHaveBeenCalled()
  })

  it('returns the drafts, 503 without an LLM key and 502 on other failures', async () => {
    mocks.generatePersonaDrafts.mockResolvedValueOnce({ drafts: [], missing: 2 })
    const ok = await call(BODY)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ drafts: [], missing: 2 })
    expect(mocks.generatePersonaDrafts).toHaveBeenCalledWith(expect.objectContaining({ count: 2, countries: ['JP'], genderMix: 'any' }))

    mocks.generatePersonaDrafts.mockRejectedValueOnce(new LlmError('llm_unavailable'))
    expect((await call(BODY)).status).toBe(503)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.generatePersonaDrafts.mockRejectedValueOnce(new LlmError('llm_timeout'))
    expect((await call(BODY)).status).toBe(502)
    consoleError.mockRestore()
  })
})
