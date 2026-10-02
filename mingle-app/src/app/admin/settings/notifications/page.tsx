import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireAdmin } from '@/server/admin/guard'
import { listAdminNotifyTargets } from '@/app/admin/settings/_lib/notify-targets'
import { NotifyTargetsManager } from './notify-targets-manager'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '알림 설정 · Mingle Admin',
  robots: { index: false, follow: false },
}

const RETURN_TO = '/admin/settings/notifications'

const GUIDANCE = '이 계정으로 Mingle 앱에 로그인된 기기에서 알림을 받습니다. 알림을 누르면 앱 안에서 관리자 인박스가 열리고, 처음 한 번은 관리자 로그인이 필요합니다.'

/**
 * Staff notification targets: which staff members' OWN Mingle accounts get a
 * push when a user writes to an operator account.
 */
export default async function AdminNotificationSettingsPage() {
  await requireAdmin(RETURN_TO)
  const targets = await listAdminNotifyTargets()

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-3 text-slate-900">
      <Link
        href="/admin/more"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[15px] font-medium text-slate-600 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <ChevronLeft size={20} aria-hidden="true" />
        더보기
      </Link>
      <h1 className="mt-1 text-[22px] font-bold leading-8">알림 받을 계정</h1>
      <p className="mt-2 break-words text-[15px] leading-6 text-slate-600">{GUIDANCE}</p>
      <NotifyTargetsManager initialTargets={targets} />
    </main>
  )
}
