import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireAdmin } from '@/server/admin/guard'
import { resolveAutoReplyModel } from '@/server/operator-auto-reply/generate'
import { getAutoReplySettings } from '@/server/operator-auto-reply/settings'
import { AutoReplyForm } from './auto-reply-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AI 자동 답장 · Mingle Admin',
  robots: { index: false, follow: false },
}

const RETURN_TO = '/admin/settings/auto-reply'

/** Whether the AI answers inbox rooms staff left waiting, and after how many minutes. */
export default async function AdminAutoReplySettingsPage() {
  await requireAdmin(RETURN_TO)
  const settings = await getAutoReplySettings()

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-3 text-slate-900">
      <Link
        href="/admin/more"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[15px] font-medium text-slate-600 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <ChevronLeft size={20} aria-hidden="true" />
        더보기
      </Link>
      <h1 className="mt-1 text-[22px] font-bold leading-8">AI 자동 답장</h1>
      <p className="mt-2 break-words text-[15px] leading-6 text-slate-600">
        운영 계정에 온 메시지에 정해진 시간 안에 답하지 못하면, AI가 그 운영 계정의 말투로 대신 답합니다.
      </p>
      <AutoReplyForm initialSettings={settings} model={resolveAutoReplyModel()} />
    </main>
  )
}
