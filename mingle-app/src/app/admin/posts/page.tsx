import type { Metadata } from 'next'
import { requireAdmin } from '@/server/admin/guard'
import { listRecentOperatorPostBatches } from '@/server/operator-posts/jobs'
import { listOperatorsForPosting } from '@/server/operator-posts/operators'
import { POST_BODY_MAX_LENGTH } from '@/server/posts/publish-post'
import AdminPostsScreen from './_components/admin-posts-screen'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '게시물 · Mingle Admin',
  robots: { index: false, follow: false },
}

/** Bulk posting as operator accounts: compose a batch, check recent batches. */
export default async function AdminPostsPage() {
  const ctx = await requireAdmin('/admin/posts')
  void ctx

  const [operators, batches] = await Promise.all([listOperatorsForPosting(), listRecentOperatorPostBatches()])
  return <AdminPostsScreen operators={operators} batches={batches} textMax={POST_BODY_MAX_LENGTH} />
}
