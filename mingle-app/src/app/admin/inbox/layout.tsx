import { unstable_rethrow } from 'next/navigation'
import type { ReactNode } from 'react'
import { getAdminContext } from '@/server/admin/guard'
import { loadInboxList } from '@/server/operator-inbox/inbox'
import { AdminSplitFrame } from '../_components/admin-split-frame'
import { InboxListView, type InboxListData } from './_components/inbox-list-view'

export const dynamic = 'force-dynamic'

/** The list's first page, or null without an admin session (the page's own guard then redirects). */
async function loadListForAdmin(): Promise<InboxListData | null> {
  try {
    return (await getAdminContext()) ? await loadInboxList() : null
  } catch (error) {
    unstable_rethrow(error)
    throw error
  }
}

/**
 * 인박스 frame: the room list, plus the open room beside it on a wide screen.
 * Presentation only; every page and route below still runs `requireAdmin`.
 */
export default async function AdminInboxLayout({ children }: { children: ReactNode }) {
  const data = await loadListForAdmin()
  if (!data) return children
  return (
    <AdminSplitFrame
      indexPath="/admin/inbox"
      listLabel="대화방 목록"
      list={<InboxListView initialData={data} initialOperatorId={null} />}
    >
      {children}
    </AdminSplitFrame>
  )
}
