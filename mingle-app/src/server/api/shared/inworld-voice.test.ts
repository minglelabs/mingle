import { afterEach, describe, expect, it, vi } from 'vitest'

function voicesResponse(ids: string[]): Response {
  return new Response(JSON.stringify({ voices: ids.map((voiceId) => ({ voiceId })) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function loadModule() {
  vi.resetModules()
  return await import('@/server/api/shared/inworld-voice')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('resolveVoiceId', () => {
  it('pins the male Seojun for Korean even when it is not listed first', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(voicesResponse(['Minji', 'Yoona', 'Seojun', 'Hyunwoo'])))
    const { resolveVoiceId } = await loadModule()
    expect(await resolveVoiceId('Basic x', 'ko')).toBe('Seojun')
  })

  it('falls back to the first Korean voice when Seojun is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(voicesResponse(['Hyunwoo', 'Minji'])))
    const { resolveVoiceId } = await loadModule()
    expect(await resolveVoiceId('Basic x', 'ko')).toBe('Hyunwoo')
  })

  it('keeps first-listed selection for other languages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(voicesResponse(['Haruto', 'Seojun'])))
    const { resolveVoiceId } = await loadModule()
    expect(await resolveVoiceId('Basic x', 'ja')).toBe('Haruto')
  })

  it('uses the default voice for a null language without calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { resolveVoiceId, DEFAULT_VOICE_ID } = await loadModule()
    expect(await resolveVoiceId('Basic x', null)).toBe(DEFAULT_VOICE_ID)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
