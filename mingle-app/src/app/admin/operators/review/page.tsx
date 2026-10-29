import type { Metadata } from 'next'
import { requireAdmin } from '@/server/admin/guard'
import { listReviewQueue } from '@/server/operator-review/review'
import { AdminEmptyState, AdminPage, AdminPageHeader, AdminPagination } from '../../_components/ui'
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

function pageHref(page: number, operator: string): string {
  const params = new URLSearchParams()
  if (operator) params.set('operator', operator)
  if (page > 1) params.set('page', String(page))
  const search = params.toString()
  return search ? `/admin/operators/review?${search}` : '/admin/operators/review'
}

export default async function OperatorReviewPage({ searchParams }: ReviewPageProps) {
  await requireAdmin('/admin/operators/review')
  const params = await searchParams
  const operator = takeFirst(params.operator).trim()
  const queue = await listReviewQueue({
    page: Number.parseInt(takeFirst(params.page), 10) || 1,
    operatorUserId: operator || undefined,
  })

  return (
    <AdminPage>
      <AdminPageHeader
        title="계정·글 검토"
        description={`검토할 계정 ${queue.totalOperators}개 · 글 ${queue.totalPosts}개. 게시하면 바로 앱에 보이고, 재제작은 피드백을 반영해 다시 만들어요.`}
        back={operator ? { href: '/admin/operators/review', label: '전체 검토' } : { href: '/admin/more', label: '더보기' }}
      />
      {queue.operators.length === 0 ? (
        <AdminEmptyState title="검토할 항목이 없어요" description="새로 만든 계정과 글이 여기에 모여요." />
      ) : (
        <>
          <ReviewBoard operators={queue.operators} focused={Boolean(operator)} />
          {queue.pageCount > 1 ? (
            <div className="mt-4">
              <AdminPagination
                label="검토 페이지"
                summary={`${queue.page} / ${queue.pageCount}`}
                previousHref={queue.page > 1 ? pageHref(queue.page - 1, operator) : undefined}
                nextHref={queue.page < queue.pageCount ? pageHref(queue.page + 1, operator) : undefined}
              />
            </div>
          ) : null}
        </>
      )}
    </AdminPage>
  )
}
