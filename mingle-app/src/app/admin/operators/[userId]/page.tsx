import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/server/admin/guard'
import { getOperatorAccountDetail } from '@/server/operators/operator-admin-query'
import { safeBackPath } from '../../_lib/back-path'
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
  searchParams: Promise<{ posts?: string; from?: string; back?: string }>
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
  const { posts, from, back } = await searchParams
  const id = decodeSegment(userId).trim()
  const account = await getOperatorAccountDetail(id)
  if (!account) {
    // Only operator accounts can be edited here ("never act as any user"); an
    // official account staff answer for (Hamzzi) opens on its read-only profile.
    const user = await prisma.user.findFirst({ where: { id, isDeleted: false }, select: { id: true } })
    if (user) redirect(`/admin/operators/${encodeURIComponent(user.id)}/profile`)
    notFound()
  }

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
        backHref={safeBackPath(back) ?? (from === 'review' ? '/admin/operators/review' : '/admin/operators')}
      />
      <OperatorPosts userId={account.id} showAll={posts === 'all'} />
    </OperatorsMain>
  )
}
