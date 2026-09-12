import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({ session: vi.fn(), block: vi.fn(), snapshot: vi.fn(), request: vi.fn(), detect: vi.fn(), after: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: m.session }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({ prisma: { userBlock: { findFirst: m.block } } }))
vi.mock('@/server/profile-bio', () => ({ getBioSnapshot: m.snapshot, requestBioTranslation: m.request, prepareBioLanguageDetection: m.detect }))
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: m.after }))
import { profileBioResponse } from './profile-bio-controller'
const base = 'http://localhost/api/users/owner/bio'
beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: 'viewer' } })
  m.block.mockResolvedValue(null)
  m.snapshot.mockResolvedValue({ original: 'Hello', sourceLanguage: 'en', language: 'ko', translation: null })
})
describe('profile bio API', () => {
  it('rejects anonymous and stale-account requests before DB access', async () => {
    m.session.mockResolvedValue(null)
    expect((await profileBioResponse(new NextRequest(base), 'owner')).status).toBe(401)
    m.session.mockResolvedValue({ user: { id: 'new-account' } })
    expect((await profileBioResponse(new NextRequest(base, { method: 'POST', headers: { 'x-mingle-expected-account-id': 'old-account' } }), 'owner')).status).toBe(401)
    expect(m.snapshot).not.toHaveBeenCalled()
  })
  it('respects the public-profile block policy', async () => {
    m.block.mockResolvedValue({ blockerId: 'owner' })
    expect((await profileBioResponse(new NextRequest(base), 'owner')).status).toBe(403)
    expect(m.request).not.toHaveBeenCalled()
  })
  it('rejects unsupported language codes and unavailable users', async () => {
    expect((await profileBioResponse(new NextRequest(base + '?language=not-a-language'), 'owner')).status).toBe(400)
    m.snapshot.mockResolvedValue(null)
    expect((await profileBioResponse(new NextRequest(base), 'owner')).status).toBe(404)
  })
  it('reads existing translations without creating or retrying a translation job', async () => {
    const response = await profileBioResponse(new NextRequest(base), 'owner')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(m.request).not.toHaveBeenCalled()
    expect(m.after).not.toHaveBeenCalled()
  })
  it('schedules only language detection for legacy profile reads', async () => {
    m.snapshot.mockResolvedValue({ original: 'Hello', sourceLanguage: null, language: 'ko' })
    const detect = vi.fn(); m.detect.mockResolvedValue(detect)
    await profileBioResponse(new NextRequest(base), 'owner')
    expect(m.after).toHaveBeenCalledWith(detect)
    expect(m.request).not.toHaveBeenCalled()
  })
  it('returns before the background translation runs and uses the viewer language', async () => {
    const job = vi.fn(); m.request.mockResolvedValue(job)
    const response = await profileBioResponse(new NextRequest(base, { method: 'POST' }), 'owner')
    expect(response.status).toBe(200)
    expect(m.request).toHaveBeenCalledWith('owner', 'ko')
    expect(job).not.toHaveBeenCalled()
    await m.after.mock.calls[0][0]()
    expect(job).toHaveBeenCalledOnce()
  })
})
