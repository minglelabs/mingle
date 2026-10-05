import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireAdmin } from '@/server/admin/guard'
import { SeedRunner } from './seed-runner'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '계정 대량 생성 · Mingle Admin',
  robots: { index: false, follow: false },
}

/** Creates many operator accounts at once from a per-country plan. */
export default async function AdminOperatorSeedPage() {
  await requireAdmin('/admin/operators/seed')
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-3 text-slate-900">
      <Link
        href="/admin/operators"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[15px] font-medium text-slate-600 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <ChevronLeft size={20} aria-hidden="true" />
        계정
      </Link>
      <h1 className="mt-1 text-[22px] font-bold leading-8">계정 대량 생성</h1>
      <p className="mt-2 break-words text-[15px] leading-6 text-slate-600">
        국가별 인원을 정하면 그 나라 사람의 프로필로 운영 계정을 한 번에 만듭니다. 기본값은 한국·일본 중심의 100명입니다.
      </p>
      <SeedRunner />
    </main>
  )
}
