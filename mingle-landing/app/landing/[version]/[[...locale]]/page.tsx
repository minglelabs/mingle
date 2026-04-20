import { Providers } from '@/app/providers'
import HomePage from '@/components/HomePage'
import { notFound } from 'next/navigation'
import { resolvePrimaryUiLocaleTag } from '../../../../../shared/i18n/mingle-locales'

const versions = ['normal', 'gaming']

type LandingVersionPageProps = {
  params: Promise<{
    version: string
    locale?: string[]
  }>
}

export default async function LandingVersionPage({ params }: LandingVersionPageProps) {
  const resolvedParams = await params
  const version = resolvedParams.version
  const routeLocale = resolvedParams.locale?.[0]
  const locale = routeLocale ? (resolvePrimaryUiLocaleTag(routeLocale) ?? undefined) : undefined

  if (!versions.includes(version)) {
    notFound()
  }

  if (routeLocale && !locale) {
    notFound()
  }

  return (
    <Providers routeLocale={locale}>
      <HomePage version={version} locale={locale} basePath="/landing" />
    </Providers>
  )
}
