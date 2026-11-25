import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/server/admin/guard'
import { loadStarterFeed } from '@/server/feed/starter-feed'
import { visiblePostWhere } from '@/server/posts/post-visibility'
import { OperatorsMain } from '../operators/_components/operator-ui'
import { FeedMore } from './feed-more'
import { LATEST_VIEW, loadFeedChunk, OLDEST_VIEW, resolveFeedView, STARTER_VIEWS } from './feed-chunk'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '피드 미리보기 · HashChat Admin',
  robots: { index: false, follow: false },
}

type FeedPreviewPageProps = { searchParams: Promise<{ as?: string; cursor?: string }> }

/**
 * The app's home feed as a user sees it, for staff: the same ranking service
 * the app calls (`getFeed`), read-only. `as` picks whose feed it is; only
 * operator accounts can be picked, and no view is recorded.
 */
export default async function FeedPreviewPage({ searchParams }: FeedPreviewPageProps) {
  await requireAdmin('/admin/feed')
  const { as, cursor } = await searchParams

  const operators = await prisma.user.findMany({
    where: { isOperator: true, isDeleted: false, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, handle: true },
  })
  const view = await resolveFeedView(as)
  const { viewer, starterView, latest, oldest } = view
  const starter = starterView ? await loadStarterFeed() : null
  // Numbered as readers see them: a listed post that was taken down, deleted or
  // made private is skipped by the feed, so it gets no number and is named apart.
  const listed = starterView && starter ? starter[starterView.segment] : []
  const listedVisible = new Set(listed.length
    ? (await prisma.post.findMany({ where: { id: { in: listed }, ...visiblePostWhere(null) }, select: { id: true } })).map((post) => post.id)
    : [])
  const starterHidden = listed.length
    ? await prisma.post.findMany({ where: { id: { in: listed.filter((id) => !listedVisible.has(id)) } }, select: { id: true, author: { select: { name: true, handle: true } } } })
    : []

  const query = (params: Record<string, string | null>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
    const text = search.toString()
    return text ? `/admin/feed?${text}` : '/admin/feed'
  }
  // The profile returns to this feed.
  const here = query({ as: view.key, cursor: cursor?.trim() || null })
  const first = await loadFeedChunk(view, cursor?.trim() || null, here)

  return (
    <OperatorsMain>
      <h1 className="text-xl font-bold text-slate-900">피드 미리보기</h1>
      <p className="mt-1 text-sm text-slate-500">최신 글·오래된 글은 추천과 상관없이 올라간 시각 순서(최신 먼저 / 오래된 것 먼저)입니다. 나머지는 앱 홈 피드와 같은 추천 순서입니다. 보기만 하며 조회 기록은 남지 않습니다. 신규 한국인·외국인은 막 가입한 유저가 보는 순서이고, 번호는 정해 둔 첫 피드 순서입니다. 운영 계정 글의 반응 숫자는 실사용자만 센 것이고, %는 조회 대비입니다.</p>

      <nav className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 pb-1" aria-label="누구의 피드로 볼지">
        <Link
          href={query({})}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${viewer || starterView || latest ? 'border-slate-200 bg-white text-slate-600' : 'border-sky-600 bg-sky-600 text-white'}`}
        >
          비로그인
        </Link>
        <Link
          href={query({ as: LATEST_VIEW })}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${latest && !oldest ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
        >
          최신 글
        </Link>
        <Link
          href={query({ as: OLDEST_VIEW })}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${oldest ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
        >
          오래된 글
        </Link>
        {STARTER_VIEWS.map((view) => (
          <Link
            key={view.key}
            href={query({ as: view.key })}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${starterView?.key === view.key ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
          >
            {view.label}
          </Link>
        ))}
        {operators.map((operator) => (
          <Link
            key={operator.id}
            href={query({ as: operator.id })}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${viewer?.id === operator.id ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
          >
            {operator.name || operator.handle}
          </Link>
        ))}
      </nav>

      {starterHidden.length ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          첫 피드 목록에 있지만 내려가거나 삭제돼서 안 보이는 글 {starterHidden.length}개(번호에서 빠짐): {starterHidden.map((post) => `${post.author.name ?? post.author.handle}(@${post.author.handle})`).join(', ')}
        </p>
      ) : null}

      {first.count === 0 ? (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">보여 줄 글이 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-3">{first.node}</ul>
      )}

      {/* The next pages load below as the list is scrolled (no page change). */}
      <FeedMore key={`${view.key ?? ''}:${cursor ?? ''}`} as={view.key} initialCursor={first.nextCursor} here={here} />
    </OperatorsMain>
  )
}
