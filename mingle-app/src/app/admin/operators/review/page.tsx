import type { Metadata } from 'next'
import { requireAdmin } from '@/server/admin/guard'
import { listReviewQueue } from '@/server/operator-review/review'
import { AdminEmptyState, AdminFilterLink, AdminPage, AdminPageHeader } from '../../_components/ui'
import { ReviewBoard } from './review-board'
import { parseReviewTab, reviewTabHref, reviewTabKind } from './review-tab'

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
  const tab = parseReviewTab(takeFirst(params.tab).trim())
  const cursor = takeFirst(params.after).trim()
  const queue = await listReviewQueue({ cursor: cursor || undefined, kind: reviewTabKind(tab) })
  const accounts = tab === 'accounts'

  return (
    <AdminPage>
      <AdminPageHeader
        title={accounts ? '계정 검토' : '글 검토'}
        description="'맨 앞으로' 고정한 것이 먼저, 나머지는 기본 순서예요."
        back={cursor ? { href: reviewTabHref(tab), label: '처음부터' } : undefined}
      />
      <nav aria-label="검토 종류" className="mx-auto mb-4 flex w-full max-w-[440px] gap-2">
        <AdminFilterLink href={reviewTabHref('posts')} active={!accounts}>글 {queue.totalPosts}</AdminFilterLink>
        <AdminFilterLink href={reviewTabHref('accounts')} active={accounts}>계정 {queue.totalProfiles}</AdminFilterLink>
      </nav>
      {queue.items.length === 0 ? (
        <AdminEmptyState
          title={accounts ? '검토할 계정이 없어요' : '검토할 글이 없어요'}
          description={accounts ? '새로 만든 계정이 여기에 모여요.' : '새로 만든 글이 여기에 모여요.'}
        />
      ) : (
        <>
          <ReviewBoard
            key={`${tab}:${cursor}:${queue.items.map((item) => item.key).join(',')}`}
            items={queue.items}
            more={{ cursor: queue.nextCursor, kind: reviewTabKind(tab) }}
          />
        </>
      )}
    </AdminPage>
  )
}
