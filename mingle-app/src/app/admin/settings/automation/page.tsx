import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireAdmin } from '@/server/admin/guard'
import { getAutomationSettings } from '@/server/operator-automation/settings'
import { getAutomationCounts } from '@/server/operator-automation/worker'
import { resolveAvatarImageModel } from '@/server/operator-avatars/generate'
import { AutomationForm } from './automation-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '자동 생성 · Mingle Admin',
  robots: { index: false, follow: false },
}

/** The automatic generation rules for operator accounts, each with a manual run. */
export default async function AdminAutomationSettingsPage() {
  await requireAdmin('/admin/settings/automation')
  const [settings, counts] = await Promise.all([getAutomationSettings(), getAutomationCounts()])

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-3 text-slate-900">
      <Link
        href="/admin/more"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[15px] font-medium text-slate-600 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <ChevronLeft size={20} aria-hidden="true" />
        더보기
      </Link>
      <h1 className="mt-1 text-[22px] font-bold leading-8">자동 생성</h1>
      <p className="mt-2 break-words text-[15px] leading-6 text-slate-600">
        운영 계정의 사진·계정·글을 자동으로 만드는 규칙과, 같은 일을 지금 바로 하는 수동 실행입니다.
      </p>
      <AutomationForm initial={{ settings, counts }} imageModel={resolveAvatarImageModel()} />
    </main>
  )
}
