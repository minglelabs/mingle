'use client'

import { createContext, useContext, useCallback, useMemo, useSyncExternalStore, type ReactNode } from 'react'

const LS_KEY_TTS_ENABLED = 'mingle_tts_enabled'
const LS_KEY_AEC_ENABLED = 'mingle_aec_enabled'
const SETTINGS_EVENT = 'mingle:tts-settings-changed'

interface TtsSettingsContextValue {
  ttsEnabled: boolean
  setTtsEnabled: (value: boolean) => void
  aecEnabled: boolean
  setAecEnabled: (value: boolean) => void
}

const TtsSettingsContext = createContext<TtsSettingsContextValue | null>(null)

function readStoredBoolean(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function subscribeToStoredBoolean(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleStorage = () => {
    onStoreChange()
  }

  window.addEventListener('storage', handleStorage)
  window.addEventListener(SETTINGS_EVENT, handleStorage)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(SETTINGS_EVENT, handleStorage)
  }
}

function useStoredBoolean(key: string): boolean {
  return useSyncExternalStore(
    subscribeToStoredBoolean,
    () => readStoredBoolean(key),
    () => false,
  )
}

function notifyStoredBooleanChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SETTINGS_EVENT))
}

export function TtsSettingsProvider({ children }: { children: ReactNode }) {
  const ttsEnabled = useStoredBoolean(LS_KEY_TTS_ENABLED)
  const aecEnabled = useStoredBoolean(LS_KEY_AEC_ENABLED)

  const setTtsEnabled = useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(LS_KEY_TTS_ENABLED, String(value))
    } catch { /* ignore */ }
    notifyStoredBooleanChanged()
  }, [])

  const setAecEnabled = useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(LS_KEY_AEC_ENABLED, String(value))
    } catch { /* ignore */ }
    notifyStoredBooleanChanged()
  }, [])

  const value = useMemo(
    () => ({ ttsEnabled, setTtsEnabled, aecEnabled, setAecEnabled }),
    [ttsEnabled, setTtsEnabled, aecEnabled, setAecEnabled],
  )

  return (
    <TtsSettingsContext.Provider value={value}>
      {children}
    </TtsSettingsContext.Provider>
  )
}

export function useTtsSettings(): TtsSettingsContextValue {
  const ctx = useContext(TtsSettingsContext)
  if (!ctx) throw new Error('useTtsSettings must be used inside TtsSettingsProvider')
  return ctx
}
