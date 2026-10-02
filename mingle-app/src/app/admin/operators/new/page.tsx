import type { Metadata } from 'next'
import { requireAdmin } from '@/server/admin/guard'
import { PERSONA_COUNTRY_PRESETS } from '@/server/operators/persona-countries'
import { OperatorsMain } from '../_components/operator-ui'
import { buildCountryOptions, buildLanguageOptions } from '../_lib/options'
import { OperatorWizard } from './operator-wizard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '운영 계정 만들기 · Mingle Admin',
  robots: { index: false, follow: false },
}

export default async function NewOperatorPage() {
  await requireAdmin('/admin/operators/new')

  return (
    <OperatorsMain>
      <OperatorWizard
        countries={buildCountryOptions()}
        presets={PERSONA_COUNTRY_PRESETS}
        languages={buildLanguageOptions()}
        currentYear={new Date().getUTCFullYear()}
      />
    </OperatorsMain>
  )
}
