'use client'

const LS_KEY_SESSION = 'mingle_demo_session_key'
const LS_KEY_TRACKING_USER = 'mingle_demo_tracking_user_id'

function createSessionKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sess_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

function createTrackingUserId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `anon_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

export function buildStorageKey(baseKey: string, namespace?: string): string {
  const normalizedNamespace = (namespace || '').trim()
  if (!normalizedNamespace) return baseKey
  return `${baseKey}__${normalizedNamespace}`
}

export function getOrCreateSessionKey(
  storageNamespace?: string,
  preferredSessionKey?: string,
): string {
  const normalizedPreferredSessionKey = (preferredSessionKey || '').trim()
  if (normalizedPreferredSessionKey) return normalizedPreferredSessionKey
  if (typeof window === 'undefined') return createSessionKey()
  try {
    const storageKey = buildStorageKey(LS_KEY_SESSION, storageNamespace)
    const existing = window.localStorage.getItem(storageKey)?.trim()
    if (existing) return existing
    const generated = createSessionKey()
    window.localStorage.setItem(storageKey, generated)
    return generated
  } catch {
    return createSessionKey()
  }
}

export function getOrCreateTrackingUserId(): string {
  if (typeof window === 'undefined') return createTrackingUserId()
  try {
    const existing = window.localStorage.getItem(LS_KEY_TRACKING_USER)?.trim()
    if (existing) return existing
    const generated = createTrackingUserId()
    window.localStorage.setItem(LS_KEY_TRACKING_USER, generated)
    return generated
  } catch {
    return createTrackingUserId()
  }
}
