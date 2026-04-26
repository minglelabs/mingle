import HomePage from '@/components/HomePage'
import { notFound } from 'next/navigation'
import { Providers } from '@/app/providers'
import { PRIMARY_UI_LOCALES } from '../../../../shared/i18n/mingle-locales'

const versions = ['normal', 'flirting', 'working', 'social', 'gaming']
const localeSet = new Set(PRIMARY_UI_LOCALES)

type VersionPageProps = {
  params: Promise<{
    version: string
    locale?: string[]
  }>
}

export default async function VersionPage({ params }: VersionPageProps) {
  const resolvedParams = await params
  const version = resolvedParams.version
  const localeSegments = resolvedParams.locale
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
  return (
    <Providers routeLocale={locale}>
      <HomePage version={version} locale={locale} />
    </Providers>
  )
}
