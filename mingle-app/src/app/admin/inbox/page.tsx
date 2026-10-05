import type { Metadata } from 'next'
import { requireAdmin } from '@/server/admin/guard'
import { AdminSplitPlaceholder } from '../_components/admin-split-frame'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '인박스 · Mingle Admin',
  robots: { index: false, follow: false },
}

/**
 * The unified operator inbox. The list itself lives in the layout (so it
 * stays beside an open room on a wide screen and reads `?operator=` itself);
 * this index only fills the empty detail pane.
 */
export default async function AdminInboxPage() {
  await requireAdmin('/admin/inbox')
  return <AdminSplitPlaceholder>왼쪽 목록에서 대화방을 선택하세요.</AdminSplitPlaceholder>
}
