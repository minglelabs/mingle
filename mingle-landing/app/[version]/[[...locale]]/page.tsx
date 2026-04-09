'use client'

import { useParams } from 'next/navigation'
import HomePage from '@/components/HomePage'
import { notFound } from 'next/navigation'
import { PRIMARY_UI_LOCALES } from '../../../../shared/i18n/mingle-locales'

const versions = ['normal', 'flirting', 'working', 'gaming']
const localeSet = new Set(PRIMARY_UI_LOCALES)

export default function VersionPage() {
  const params = useParams()
  const version = params.version as string
  const localeSegments = params.locale as string[] | undefined
  const locale = localeSegments?.[0]

  // 유효하지 않은 버전이면 404
  if (!versions.includes(version)) {
    notFound()
  }

  // locale이 있는데 유효하지 않으면 404
  if (locale && !localeSet.has(locale as (typeof PRIMARY_UI_LOCALES)[number])) {
    notFound()
  }

  // version과 locale을 HomePage에 전달
  return <HomePage version={version} locale={locale} />
}
