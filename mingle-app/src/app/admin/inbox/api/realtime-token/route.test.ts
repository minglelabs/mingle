import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ requireAdminApi: vi.fn() }))

vi.mock('@/server/admin/guard', () => ({ requireAdminApi: m.requireAdminApi }))

import { GET } from './route'
import { verifyRealtimeToken } from '@/lib/realtime-token'

const ctx = { sessionId: null, ip: null, userAgent: null }

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://127.0.0.1:3000/admin/inbox/api/realtime-token', { headers })
}

describe('GET /admin/inbox/api/realtime-token', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('MINGLE_REALTIME_SECRET', 'shared-secret')
    vi.stubEnv('NEXT_PUBLIC_MESSAGING_WS_URL', '')
    vi.stubEnv('NEXT_PUBLIC_WS_URL', '')
    m.requireAdminApi.mockResolvedValue({ ok: true, ctx })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses without an admin session', async () => {
    m.requireAdminApi.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }),
    })
    const response = await GET(request())
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns an uncacheable token for the admin topic, its key and the socket URL', async () => {
    const response = await GET(request({ host: '127.0.0.1:3000', 'x-forwarded-host': 'mingle.example.com', 'x-forwarded-proto': 'https' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const body = await response.json() as { token: string; wsUrl: string; key: string }
    expect(body.key).toMatch(/^admin:[0-9a-f]{32}$/)
    expect(body.wsUrl).toBe('wss://mingle.example.com/conversation-events')
    const payload = verifyRealtimeToken(body.token, 'shared-secret')
    expect(payload).toMatchObject({ sessionKey: body.key, userId: 'admin' })
  })

  it('uses the configured messaging socket when there is one', async () => {
    vi.stubEnv('NEXT_PUBLIC_MESSAGING_WS_URL', 'wss://messaging.example.com')
    const body = await (await GET(request())).json() as { wsUrl: string }
    expect(body.wsUrl).toBe('wss://messaging.example.com/conversation-events')
  })

  it('returns nulls when realtime is unconfigured, so the inbox just polls', async () => {
    vi.stubEnv('MINGLE_REALTIME_SECRET', '')
    const response = await GET(request({ host: 'localhost:3000' }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ token: null, wsUrl: null, key: null })
  })
})
