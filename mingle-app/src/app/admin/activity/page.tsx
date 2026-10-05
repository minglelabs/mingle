import type { Metadata } from 'next'
import { requireAdmin } from '@/server/admin/guard'
import { AdminSplitPlaceholder } from '../_components/admin-split-frame'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '알림 · Mingle Admin',
  robots: { index: false, follow: false },
}

/** Operator activity. The list lives in the layout; this index only fills the empty detail pane. */
export default async function AdminActivityPage() {
  await requireAdmin('/admin/activity')
  return <AdminSplitPlaceholder>왼쪽 목록에서 댓글이나 좋아요를 선택하면 글과 댓글이 열립니다.</AdminSplitPlaceholder>
}
