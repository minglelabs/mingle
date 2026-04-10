'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_LANDING_LOCALE,
  LandingI18nProvider,
  readPersistedLandingLocale,
  resolveLandingLocale,
  resolvePreferredLandingLocale,
} from '@/lib/i18n'
import type { PrimaryUiLocale } from '../../shared/i18n/mingle-locales'

function detectClientPreferredLocale(): PrimaryUiLocale {
  return resolvePreferredLandingLocale({
    storedLocale: readPersistedLandingLocale(),
    navigatorLocale: typeof navigator === 'undefined' ? null : navigator.language,
  })
}

export function Providers(props: {
  children: React.ReactNode
  routeLocale?: string | null
}) {
  const { children, routeLocale } = props
  const resolvedRouteLocale = routeLocale ? resolveLandingLocale(routeLocale) : null
  const [detectedLocale, setDetectedLocale] = useState<PrimaryUiLocale>(() => {
    if (resolvedRouteLocale) {
      return resolvedRouteLocale
    }

    if (typeof window === 'undefined') {
      return DEFAULT_LANDING_LOCALE
    }

    return detectClientPreferredLocale()
  })
  const [isLocaleReady, setIsLocaleReady] = useState(() => (
    resolvedRouteLocale !== null || typeof window !== 'undefined'
  ))

  const handleChangeLanguage = useCallback((nextLanguage: string) => {
    setDetectedLocale(resolveLandingLocale(nextLanguage))
    setIsLocaleReady(true)
  }, [])

  useEffect(() => {
    if (resolvedRouteLocale) {
      setDetectedLocale(resolvedRouteLocale)
      setIsLocaleReady(true)
      return
    }

    setIsLocaleReady(true)
  }, [resolvedRouteLocale])

  return (
    <LandingI18nProvider
      language={detectedLocale}
      changeLanguage={handleChangeLanguage}
      isReady={isLocaleReady}
    >
      {children}
    </LandingI18nProvider>
  )
}
