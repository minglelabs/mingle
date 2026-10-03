import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/server/admin/guard'
import { AvatarGrid, type AvatarGridItem } from './avatar-grid'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '사진 검수 · Mingle Admin',
  robots: { index: false, follow: false },
}

const MAX_ITEMS = 500

function specLabel(spec: unknown): string | null {
  const label = spec && typeof spec === 'object' && !Array.isArray(spec) ? (spec as { labelKo?: unknown }).labelKo : null
  return typeof label === 'string' && label ? label : null
}

/** Every active operator account's profile photo, to review generated ones and redo any. */
export default async function AdminOperatorAvatarsPage() {
  await requireAdmin('/admin/operators/avatars')
  const rows = await prisma.user.findMany({
    where: { isOperator: true, isDeleted: false, isActive: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_ITEMS,
    select: {
      id: true, name: true, handle: true, image: true,
      operatorAccount: { select: { personaCountry: true, avatarSpec: true } },
    },
  })
  const items: AvatarGridItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    handle: row.handle,
    image: row.image,
    label: specLabel(row.operatorAccount?.avatarSpec),
    country: row.operatorAccount?.personaCountry ?? null,
  }))

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-3 text-slate-900">
      <Link
        href="/admin/settings/automation"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[15px] font-medium text-slate-600 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <ChevronLeft size={20} aria-hidden="true" />
        자동 생성
      </Link>
      <h1 className="mt-1 text-[22px] font-bold leading-8">사진 검수</h1>
      <p className="mt-2 break-words text-[15px] leading-6 text-slate-600">
        어색한 사진은 다시 만들기를 누르면 다른 유형으로 새로 만듭니다. 종이비행기 버튼은 그 계정의 잠재 글 1개를 지금 올립니다.
        {rows.length === MAX_ITEMS ? ` 최근 ${MAX_ITEMS}개 계정만 표시합니다.` : ''}
      </p>
      <AvatarGrid initialItems={items} />
    </main>
  )
}
