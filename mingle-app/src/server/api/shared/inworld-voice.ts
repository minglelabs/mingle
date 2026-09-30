/**
 * Inworld voice 해석 및 캐싱 — 여러 handler에서 공통 사용.
 */

const INWORLD_API_BASE = 'https://api.inworld.ai'
const DEFAULT_VOICE_ID = process.env.INWORLD_TTS_DEFAULT_VOICE_ID || 'Ashley'
const VOICE_CACHE_TTL_MS = 1000 * 60 * 30
/**
 * Preferred voice per language, used when the language's voice list contains
 * it. Korean pins the male "Seojun" (median F0 ~100 Hz measured) instead of
 * relying on the list order; other languages take the first listed voice.
 */
const PREFERRED_VOICE_BY_LANGUAGE: Readonly<Record<string, string>> = {
  ko: 'Seojun',
}

interface InworldVoiceItem {
  id?: string
  voiceId?: string
  name?: string
}

const voiceCache = new Map<string, { voiceId: string, expiresAt: number }>()

export function pickVoiceId(item: InworldVoiceItem): string | null {
  if (item.voiceId && typeof item.voiceId === 'string') return item.voiceId
  if (item.id && typeof item.id === 'string') return item.id
  if (item.name && typeof item.name === 'string') return item.name
  return null
}

export async function resolveVoiceId(authHeader: string, language: string | null): Promise<string> {
  if (!language) return DEFAULT_VOICE_ID

  const now = Date.now()
  const cached = voiceCache.get(language)
  if (cached && cached.expiresAt > now) {
    return cached.voiceId
  }

  try {
    const url = `${INWORLD_API_BASE}/tts/v1/voices?filter=${encodeURIComponent(`language=${language}`)}`
    const response = await fetch(url, {
      headers: { Authorization: authHeader },
      cache: 'no-store',
    })
    if (!response.ok) {
      return DEFAULT_VOICE_ID
    }

    const data = await response.json() as { voices?: InworldVoiceItem[], items?: InworldVoiceItem[] }
    const voices = Array.isArray(data.voices) ? data.voices : (Array.isArray(data.items) ? data.items : [])
    const ids = voices
      .map(pickVoiceId)
      .filter((id): id is string => Boolean(id))
    const preferred = PREFERRED_VOICE_BY_LANGUAGE[language]
    const resolved = (preferred && ids.includes(preferred) ? preferred : ids[0])
    const voiceId = resolved || DEFAULT_VOICE_ID
    voiceCache.set(language, { voiceId, expiresAt: now + VOICE_CACHE_TTL_MS })
    return voiceId
  } catch {
    return DEFAULT_VOICE_ID
  }
}

export { DEFAULT_VOICE_ID, INWORLD_API_BASE }
