'use client'

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'

const LS_KEY_TTS_ENABLED = 'mingle_tts_enabled'
const LS_KEY_AEC_ENABLED = 'mingle_aec_enabled'
const FIXED_TTS_ENABLED = false
const FIXED_AEC_ENABLED = false

interface TtsSettingsContextValue {
  ttsEnabled: boolean
  setTtsEnabled: (value: boolean) => void
  aecEnabled: boolean
  setAecEnabled: (value: boolean) => void
}

const TtsSettingsContext = createContext<TtsSettingsContextValue | null>(null)

function clearDeprecatedStoredAudioPreferences(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LS_KEY_TTS_ENABLED)
    window.localStorage.removeItem(LS_KEY_AEC_ENABLED)
  } catch {
    // Ignore storage failures so the fixed defaults remain available.
  }
}

export function TtsSettingsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    clearDeprecatedStoredAudioPreferences()
  }, [])

  const value = useMemo(
    () => ({
      ttsEnabled: FIXED_TTS_ENABLED,
      setTtsEnabled: () => {},
      aecEnabled: FIXED_AEC_ENABLED,
      setAecEnabled: () => {},
    }),
    [],
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
