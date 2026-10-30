import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/server/admin/guard'
import { getOperatorAccountDetail } from '@/server/operators/operator-admin-query'
import { OperatorsMain } from '../_components/operator-ui'
import { buildCountryOptions, buildLanguageOptions } from '../_lib/options'
import { OperatorEditor } from './operator-editor'
import { OperatorPosts } from './operator-posts'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '운영 계정 · HashChat Admin',
  robots: { index: false, follow: false },
}

type OperatorDetailPageProps = {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ posts?: string; from?: string }>
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default async function OperatorDetailPage({ params, searchParams }: OperatorDetailPageProps) {
  const { userId } = await params
  await requireAdmin(`/admin/operators/${userId}`)
  const { posts, from } = await searchParams
  const account = await getOperatorAccountDetail(decodeSegment(userId).trim())
  if (!account) notFound()

  return (
    <OperatorsMain>
      <Link href={`/admin/operators/${encodeURIComponent(account.id)}/profile`} className="mb-3 inline-block text-sm font-semibold text-sky-700">
        프로필로 보기 (올라간 글·검토 대기) ›
      </Link>
      <OperatorEditor
        initial={account}
        countries={buildCountryOptions()}
        languages={buildLanguageOptions()}
        currentYear={new Date().getUTCFullYear()}
        backHref={from === 'review' ? '/admin/operators/review' : '/admin/operators'}
      />
      <OperatorPosts userId={account.id} showAll={posts === 'all'} />
    </OperatorsMain>
  )
}
