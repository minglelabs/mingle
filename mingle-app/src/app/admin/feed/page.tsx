import type { Metadata } from 'next'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/server/admin/guard'
import { FEED_PAGE_SELECT, getFeed, type FeedResult } from '@/server/feed/feed-service'
import { loadStarterFeed, type StarterSegment } from '@/server/feed/starter-feed'
import { loadOperatorPostStats } from '@/server/operator-post-stats/load'
import { visiblePostWhere } from '@/server/posts/post-visibility'
import { OperatorPostStatsRow } from '../_components/operator-post-stats-row'
import { adminProfileHref } from '../_lib/profile-href'
import { InlinePostComments } from '../activity/_components/inline-post-comments'
import { OperatorAvatar, OperatorsMain } from '../operators/_components/operator-ui'
import { OperatorPostEditor } from './_components/operator-post-editor'
import { PostBody } from './_components/post-body'
import { ZoomableImage } from './_components/zoomable-image'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '피드 미리보기 · HashChat Admin',
  robots: { index: false, follow: false },
}

const PAGE_SIZE = 20

const STARTER_VIEWS: ReadonlyArray<{ key: string; segment: StarterSegment; label: string }> = [
  { key: 'new-ko', segment: 'ko', label: '신규 한국인' },
  { key: 'new-foreign', segment: 'foreign', label: '신규 외국인' },
]
/** `as=latest`: every visible post, newest first (not the recommended order). */
const LATEST_VIEW = 'latest'

/** Visible posts by published time, newest first; cursor `<iso>|<id>`. */
async function loadLatestPosts(rawCursor: string | null): Promise<FeedResult> {
  const [iso, id] = (rawCursor ?? '').split('|')
  const at = iso ? new Date(iso) : null
  const after = at && !Number.isNaN(at.getTime()) && id
    ? { AND: [{ OR: [{ publishedAt: { lt: at } }, { publishedAt: at, id: { lt: id } }] }] }
    : {}
  const rows = await prisma.post.findMany({
    where: { ...visiblePostWhere(null), ...after },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    select: FEED_PAGE_SELECT,
  })
  const page = rows.slice(0, PAGE_SIZE)
  const last = page.at(-1)
  return {
    posts: page.map((post) => ({ ...post, viewed: false })),
    nextCursor: rows.length > PAGE_SIZE && last ? `${last.publishedAt.toISOString()}|${last.id}` : null,
  }
}

type FeedPreviewPageProps = { searchParams: Promise<{ as?: string; cursor?: string }> }

function relativeTime(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000))
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}시간 전`
  return `${Math.floor(minutes / (24 * 60))}일 전`
}

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
  const viewer = operators.find((operator) => operator.id === as) ?? null
  // A new reader of either segment: no account, no views, so the starter list leads exactly as it will.
  const starterView = (STARTER_VIEWS.find((view) => view.key === as) ?? null)
  const latest = as === LATEST_VIEW
  const feed = latest
    ? await loadLatestPosts(cursor?.trim() || null)
    : await getFeed(viewer?.id ?? null, cursor?.trim() || null, PAGE_SIZE, starterView ? { starterSegment: starterView.segment } : {})
  const starter = await loadStarterFeed()
  // Numbered as readers see them: a listed post that was taken down, deleted or
  // made private is skipped by the feed, so it gets no number and is named apart.
  const listed = starterView && starter ? starter[starterView.segment] : []
  const listedVisible = new Set(listed.length
    ? (await prisma.post.findMany({ where: { id: { in: listed }, ...visiblePostWhere(null) }, select: { id: true } })).map((post) => post.id)
    : [])
  const starterOrder = new Map(listed.filter((id) => listedVisible.has(id)).map((id, index) => [id, index + 1]))
  const starterHidden = listed.length
    ? await prisma.post.findMany({ where: { id: { in: listed.filter((id) => !listedVisible.has(id)) } }, select: { id: true, author: { select: { name: true, handle: true } } } })
    : []

  const postIds = feed.posts.map((post) => post.id)
  const authors = await prisma.user.findMany({
    where: { id: { in: [...new Set(feed.posts.map((post) => post.author.id))] } },
    select: { id: true, primaryLanguages: true },
  })
  const authorLanguages = new Map(authors.map((author) => [author.id, author.primaryLanguages]))
  const versions = await prisma.post.findMany({
    where: { id: { in: postIds } },
    select: { id: true, bodyVersion: true, translations: { where: { status: 'ready', text: { not: null } }, select: { bodyVersion: true, language: true, text: true }, orderBy: { language: 'asc' } } },
  })
  const translationsByPost = new Map(versions.map((post) => [
    post.id,
    post.translations.filter((translation) => translation.bodyVersion === post.bodyVersion).map((translation) => ({ language: translation.language, text: translation.text! })),
  ]))
  const statsByPost = await loadOperatorPostStats({ postIds: feed.posts.filter((post) => post.author.isOperator).map((post) => post.id) })

  const now = new Date()
  const query = (params: Record<string, string | null>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
    const text = search.toString()
    return text ? `/admin/feed?${text}` : '/admin/feed'
  }
  // The profile returns to this page of this feed.
  const here = query({ as: as?.trim() || null, cursor: cursor?.trim() || null })

  return (
    <OperatorsMain>
      <h1 className="text-xl font-bold text-slate-900">피드 미리보기</h1>
      <p className="mt-1 text-sm text-slate-500">최신 글은 추천과 상관없이 올라간 시각 순서(최신 먼저)입니다. 나머지는 앱 홈 피드와 같은 추천 순서입니다. 보기만 하며 조회 기록은 남지 않습니다. 신규 한국인·외국인은 막 가입한 유저가 보는 순서이고, 번호는 정해 둔 첫 피드 순서입니다. 운영 계정 글의 반응 숫자는 실사용자만 센 것이고, %는 조회 대비입니다.</p>

      <nav className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 pb-1" aria-label="누구의 피드로 볼지">
        <Link
          href={query({})}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${viewer || starterView || latest ? 'border-slate-200 bg-white text-slate-600' : 'border-sky-600 bg-sky-600 text-white'}`}
        >
          비로그인
        </Link>
        <Link
          href={query({ as: LATEST_VIEW })}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${latest ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
        >
          최신 글
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

      {feed.posts.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">보여 줄 글이 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {feed.posts.map((post) => {
            const profile = adminProfileHref(post.author.id, here)
            return (
              <li key={post.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                {starterOrder.has(post.id) ? (
                  <p className="mb-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">첫 피드 {starterOrder.get(post.id)}번</p>
                ) : null}
                <div className="flex items-center gap-3">
                  <Link href={profile} aria-label={`${post.author.name || post.author.handle} 프로필`} className="shrink-0 rounded-full">
                    <OperatorAvatar image={post.author.image} name={post.author.name} size={40} languages={authorLanguages.get(post.author.id)} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={profile} className="block truncate text-sm font-semibold text-slate-900">{post.author.name || '이름 없음'}</Link>
                    <p className="truncate text-xs text-slate-500">
                      @{post.author.handle} · {relativeTime(post.publishedAt, now)}
                      {post.sourceLanguage ? ` · ${post.sourceLanguage}` : ''}
                    </p>
                  </div>
                  {post.author.isOperator ? (
                    <Link href={`/admin/operators/${post.author.id}`} className="shrink-0 text-xs font-medium text-sky-700">계정 보기</Link>
                  ) : null}
                </div>

                {post.sourceText ? (
                  <PostBody
                    sourceText={post.sourceText}
                    sourceLanguage={post.sourceLanguage}
                    translations={(translationsByPost.get(post.id) ?? []).filter((translation) => translation.language !== post.sourceLanguage)}
                  />
                ) : null}
                {post.imageObjectKey ? (
                  <div className={`mt-3 flex gap-2 ${post.extraImages.length ? 'no-scrollbar snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain' : ''}`}>
                    {[
                      { src: `/api/posts/${post.id}/image/hashchat-${post.id.slice(-8)}.jpg?k=${encodeURIComponent(post.imageObjectKey.slice(-16))}`, width: post.imageWidth, height: post.imageHeight },
                      ...post.extraImages.map((image) => ({ src: `/api/posts/${post.id}/image/hashchat-${post.id.slice(-8)}-${image.position}.jpg?index=${image.position}`, width: image.imageWidth, height: image.imageHeight })),
                    ].map((photo, index, all) => (
                      <div key={photo.src} className={all.length > 1 ? 'w-[85%] shrink-0 snap-center' : 'w-full'}>
                        <ZoomableImage
                          src={photo.src}
                          alt={`글 사진 ${index + 1}`}
                          width={photo.width ?? undefined}
                          height={photo.height ?? undefined}
                          loading="lazy"
                          decoding="async"
                          className="h-auto max-h-[80svh] w-full rounded-xl border border-slate-200 bg-slate-900 object-contain"
                        />
                        {all.length > 1 ? <p className="mt-1 text-center text-xs text-slate-500">{index + 1}/{all.length}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {post.author.isOperator ? (
                  <OperatorPostEditor key={`${post.id}:${post.bodyVersion}`} postId={post.id} text={post.sourceText} hasPhoto={Boolean(post.imageObjectKey)} language={post.sourceLanguage} publishedAt={post.publishedAt?.toISOString() ?? null} />
                ) : null}

                <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1"><Heart className="h-4 w-4" aria-hidden="true" />{post.likeCount}</span>
                </div>
                <OperatorPostStatsRow stats={statsByPost.get(post.id)} className="mt-2" />
                {/* Replies go out as the post's own operator, else as the account whose feed this is (or the thread picks one). */}
                <InlinePostComments postId={post.id} operatorUserId={post.author.isOperator ? post.author.id : viewer?.id ?? null} commentCount={post.commentCount} />
              </li>
            )
          })}
        </ul>
      )}

      {feed.nextCursor ? (
        <Link
          href={query({ as: viewer?.id ?? starterView?.key ?? (latest ? LATEST_VIEW : null), cursor: feed.nextCursor })}
          className="mt-3 flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 active:bg-slate-100"
        >
          다음 글 보기
        </Link>
      ) : null}
    </OperatorsMain>
  )
}
