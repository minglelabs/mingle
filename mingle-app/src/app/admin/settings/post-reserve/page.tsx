import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireAdmin } from '@/server/admin/guard'
import { resolveAutoReplyModel } from '@/server/operator-auto-reply/generate'
import { getPostReserveSettings } from '@/server/operator-post-reserve/settings'
import { getPostReserveStats } from '@/server/operator-post-reserve/worker'
import { PostReserveForm } from './post-reserve-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '잠재 글 · Mingle Admin',
  robots: { index: false, follow: false },
}

const RETURN_TO = '/admin/settings/post-reserve'

/** How many posts each operator account keeps pre-written, and what share goes out per day. */
export default async function AdminPostReserveSettingsPage() {
  await requireAdmin(RETURN_TO)
  const settings = await getPostReserveSettings()
  const stats = await getPostReserveStats(settings.targetPerOperator)

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-3 text-slate-900">
      <Link
        href="/admin/more"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[15px] font-medium text-slate-600 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <ChevronLeft size={20} aria-hidden="true" />
        더보기
      </Link>
      <h1 className="mt-1 text-[22px] font-bold leading-8">잠재 글</h1>
      <p className="mt-2 break-words text-[15px] leading-6 text-slate-600">
        운영 계정마다 글을 미리 써 두고, 매일 그중 일부를 자동으로 올립니다. 줄어든 만큼 계속 다시 채웁니다.
      </p>
      <PostReserveForm initial={{ settings, stats }} model={resolveAutoReplyModel()} />
    </main>
  )
}
