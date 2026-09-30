import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/server/admin/guard'
import { getOperatorPostBatch } from '@/server/operator-posts/jobs'
import BatchStatusView from '../../_components/batch-status-view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '배치 상태 · Mingle Admin',
  robots: { index: false, follow: false },
}

type PageProps = { params: Promise<{ batchId: string }> }

/** One batch of operator posts: each item's state, cancel for queued items, links to published posts. */
export default async function AdminPostBatchPage({ params }: PageProps) {
  const ctx = await requireAdmin(`/admin/posts/batches/${encodeURIComponent((await params).batchId)}`)
  void ctx

  const { batchId } = await params
  const batch = await getOperatorPostBatch(batchId.trim())
  if (!batch) notFound()
  return <BatchStatusView initial={batch} />
}
