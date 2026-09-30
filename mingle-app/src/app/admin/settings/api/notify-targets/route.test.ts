import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  listAdminNotifyTargets: vi.fn(),
  addAdminNotifyTarget: vi.fn(),
  removeAdminNotifyTarget: vi.fn(),
}))

vi.mock('@/server/admin/guard', () => ({ requireAdminApi: m.requireAdminApi }))
vi.mock('@/app/admin/settings/_lib/notify-targets', () => ({
  listAdminNotifyTargets: m.listAdminNotifyTargets,
  addAdminNotifyTarget: m.addAdminNotifyTarget,
  removeAdminNotifyTarget: m.removeAdminNotifyTarget,
}))

import { GET, POST } from './route'
import { DELETE } from './[userId]/route'

const ctx = { sessionId: 'adm_sess_1', ip: null, userAgent: null }
const targets = [{ userId: 'staff_1', handle: 'mina' }]

function post(body: unknown, contentType = 'application/json') {
  return new NextRequest('https://mingle.example.com/admin/settings/api/notify-targets', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function remove(userId: string) {
  return DELETE(new Request(`https://mingle.example.com/admin/settings/api/notify-targets/${userId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ userId }),
  })
}

describe('/admin/settings/api/notify-targets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.requireAdminApi.mockResolvedValue({ ok: true, ctx })
    m.listAdminNotifyTargets.mockResolvedValue(targets)
  })

  it('refuses every method without an admin session', async () => {
    m.requireAdminApi.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    expect((await GET()).status).toBe(401)
    expect((await POST(post({ handle: 'mina' }))).status).toBe(401)
    expect((await remove('staff_1')).status).toBe(401)
    expect(m.listAdminNotifyTargets).not.toHaveBeenCalled()
    expect(m.addAdminNotifyTarget).not.toHaveBeenCalled()
    expect(m.removeAdminNotifyTarget).not.toHaveBeenCalled()
  })

  it('lists the targets, uncached', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ targets })
  })

  it('adds by handle with the admin context: 201 when new, 200 when it already was a target', async () => {
    m.addAdminNotifyTarget.mockResolvedValueOnce({ ok: true, added: true, targets })
    const created = await POST(post({ handle: '@mina' }))
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toEqual({ added: true, targets })
    expect(m.addAdminNotifyTarget).toHaveBeenCalledWith(ctx, '@mina')

    m.addAdminNotifyTarget.mockResolvedValueOnce({ ok: true, added: false, targets })
    expect((await POST(post({ handle: 'mina' }))).status).toBe(200)
  })

  it.each([
    ['invalid_handle', 400],
    ['not_found', 404],
    ['operator_account', 422],
    ['inactive_account', 422],
    ['guest_account', 422],
  ])('maps the %s refusal to %i', async (error, status) => {
    m.addAdminNotifyTarget.mockResolvedValue({ ok: false, error })
    const response = await POST(post({ handle: 'x' }))
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({ error })
  })

  it('accepts JSON only', async () => {
    expect((await POST(post('handle=mina', 'application/x-www-form-urlencoded'))).status).toBe(415)
    expect((await POST(post('{not json'))).status).toBe(400)
    expect(m.addAdminNotifyTarget).not.toHaveBeenCalled()
  })

  it('answers 500 JSON when the store fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.addAdminNotifyTarget.mockRejectedValue(new Error('db down'))
    const response = await POST(post({ handle: 'mina' }))
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'server_error' })
    error.mockRestore()
  })

  it('removes by user id with the admin context', async () => {
    m.removeAdminNotifyTarget.mockResolvedValue({ ok: true, removed: true, targets: [] })
    const response = await remove('staff_1')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ removed: true, targets: [] })
    expect(m.removeAdminNotifyTarget).toHaveBeenCalledWith(ctx, 'staff_1')

    m.removeAdminNotifyTarget.mockResolvedValue({ ok: false, error: 'invalid_user_id' })
    expect((await remove('a b')).status).toBe(400)
  })
})
