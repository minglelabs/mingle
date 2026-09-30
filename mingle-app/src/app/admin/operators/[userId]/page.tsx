import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/server/admin/guard'
import { getOperatorAccountDetail } from '@/server/operators/operator-admin-query'
import { OperatorsMain } from '../_components/operator-ui'
import { buildCountryOptions, buildLanguageOptions } from '../_lib/options'
import { OperatorEditor } from './operator-editor'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '운영 계정 · Mingle Admin',
  robots: { index: false, follow: false },
}

type OperatorDetailPageProps = { params: Promise<{ userId: string }> }

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default async function OperatorDetailPage({ params }: OperatorDetailPageProps) {
  await requireAdmin('/admin/operators')
  const { userId } = await params
  const account = await getOperatorAccountDetail(decodeSegment(userId).trim())
  if (!account) notFound()

  return (
    <OperatorsMain>
      <OperatorEditor
        initial={account}
        countries={buildCountryOptions()}
        languages={buildLanguageOptions()}
        currentYear={new Date().getUTCFullYear()}
      />
    </OperatorsMain>
  )
}
