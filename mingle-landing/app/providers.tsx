'use client'

import { useEffect, useState } from 'react'
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
  const [detectedLocale, setDetectedLocale] = useState<PrimaryUiLocale>(() => (
    resolvedRouteLocale ?? DEFAULT_LANDING_LOCALE
  ))

  useEffect(() => {
    if (resolvedRouteLocale) {
      setDetectedLocale(resolvedRouteLocale)
      return
    }

    setDetectedLocale(detectClientPreferredLocale())
  }, [resolvedRouteLocale])

  return (
    <LandingI18nProvider initialLocale={detectedLocale}>
      {children}
    </LandingI18nProvider>
  )
}
