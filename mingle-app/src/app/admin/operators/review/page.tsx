import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/server/admin/guard'
import { listReviewQueue, REVIEW_ITEMS_PER_PAGE } from '@/server/operator-review/review'
import { AdminEmptyState, AdminPage, AdminPageHeader } from '../../_components/ui'
import { ReviewBoard } from './review-board'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '계정·글 검토 · HashChat Admin',
  robots: { index: false, follow: false },
}

type ReviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value
  return Array.isArray(value) ? value[0] ?? '' : ''
}

export default async function OperatorReviewPage({ searchParams }: ReviewPageProps) {
  await requireAdmin('/admin/operators/review')
  const params = await searchParams
  const cursor = takeFirst(params.after).trim()
  const queue = await listReviewQueue({ cursor: cursor || undefined })

  return (
    <AdminPage>
      <AdminPageHeader
        title="계정·글 검토"
        description={`검토할 계정 ${queue.totalProfiles}개 · 글 ${queue.totalPosts}개. '맨 앞으로' 고정한 것이 먼저, 나머지는 기본 순서예요.`}
        back={cursor ? { href: '/admin/operators/review', label: '처음부터' } : undefined}
      />
      {queue.items.length === 0 ? (
        <AdminEmptyState title="검토할 항목이 없어요" description="새로 만든 계정과 글이 여기에 모여요." />
      ) : (
        <>
          <ReviewBoard key={`${cursor}:${queue.items.map((item) => item.key).join(',')}`} items={queue.items} />
          {queue.nextCursor ? (
            <div className="mx-auto mt-6 w-full max-w-[440px]">
              <Link
                href={`/admin/operators/review?after=${encodeURIComponent(queue.nextCursor)}`}
                className="block rounded-lg border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-sky-700"
              >
                다음 {REVIEW_ITEMS_PER_PAGE}개
              </Link>
            </div>
          ) : null}
        </>
      )}
    </AdminPage>
  )
}
