import { unstable_rethrow } from 'next/navigation'
import type { ReactNode } from 'react'
import { getAdminContext } from '@/server/admin/guard'
import { loadActivityList, type ActivityListData } from '@/server/operator-activity/activity'
import { AdminSplitFrame } from '../_components/admin-split-frame'
import { ActivityListView } from './_components/activity-list-view'

export const dynamic = 'force-dynamic'

/** The list's first page, or null without an admin session (the page's own guard then redirects). */
async function loadListForAdmin(): Promise<ActivityListData | null> {
  try {
    return (await getAdminContext()) ? await loadActivityList() : null
  } catch (error) {
    unstable_rethrow(error)
    throw error
  }
}

/**
 * 알림 frame: every operator account's notifications, plus the open thread
 * beside them on a wide screen. Presentation only; every page and route
 * below still runs `requireAdmin`.
 */
export default async function AdminActivityLayout({ children }: { children: ReactNode }) {
  const data = await loadListForAdmin()
  if (!data) return children
  return (
    <AdminSplitFrame indexPath="/admin/activity" listLabel="알림 목록" list={<ActivityListView initialData={data} />}>
      {children}
    </AdminSplitFrame>
  )
}
