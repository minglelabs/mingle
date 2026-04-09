'use client'

import { useEffect, useState } from 'react'
import {
  LandingI18nProvider,
  readPersistedLandingLocale,
  resolveLandingLocale,
} from '@/lib/i18n'
import { PRIMARY_UI_LOCALES } from '../../shared/i18n/mingle-locales'

const versions = ['normal', 'flirting', 'working', 'gaming']
const localeSet = new Set(PRIMARY_UI_LOCALES)

function detectInitialLocale(): string {
  const pathname = window.location.pathname
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length >= 2 && versions.includes(segments[0]) && localeSet.has(segments[1] as (typeof PRIMARY_UI_LOCALES)[number])) {
    return resolveLandingLocale(segments[1])
  }

  if (segments.length >= 1 && localeSet.has(segments[0] as (typeof PRIMARY_UI_LOCALES)[number])) {
    return resolveLandingLocale(segments[0])
  }

  const storedLocale = readPersistedLandingLocale()
  if (storedLocale) {
    return storedLocale
  }

  return resolveLandingLocale(navigator.language)
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const [detectedLocale, setDetectedLocale] = useState('en')

  useEffect(() => {
    setDetectedLocale(detectInitialLocale())
    setMounted(true)
  }, [])

  // Show loading state until client-side hydration is complete
  // This prevents hydration mismatch from i18n language detection
  if (!mounted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl font-extrabold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent mb-4">
            Mingle
          </div>
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  return (
    <LandingI18nProvider initialLocale={detectedLocale}>
      {children}
    </LandingI18nProvider>
  )
}
