import type { Metadata } from 'next'
import { requireAdmin } from '@/server/admin/guard'
import { loadInboxList, normalizeInboxId } from '@/server/operator-inbox/inbox'
import { InboxListView } from './_components/inbox-list-view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '인박스 · Mingle Admin',
  robots: { index: false, follow: false },
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : ''
}

/** The unified operator inbox: every room an operator account is in, newest first. */
export default async function AdminInboxPage({ searchParams }: PageProps) {
  const ctx = await requireAdmin('/admin/inbox')
  void ctx
  const params = await searchParams
  const operatorUserId = normalizeInboxId(firstParam(params.operator))
  const data = await loadInboxList({ operatorUserId })
  return <InboxListView initialData={data} initialOperatorId={operatorUserId} />
}
