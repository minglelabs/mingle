import type { Metadata } from 'next'
import Link from 'next/link'
import { Heart, MessageCircle } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/server/admin/guard'
import { getFeed } from '@/server/feed/feed-service'
import { loadStarterFeed, type StarterSegment } from '@/server/feed/starter-feed'
import { loadOperatorPostStats } from '@/server/operator-post-stats/load'
import { visibleCommentsWhere } from '@/server/posts/comment-visibility'
import { OperatorPostStatsRow } from '../_components/operator-post-stats-row'
import { OperatorsMain } from '../operators/_components/operator-ui'
import { ZoomableAvatar } from '../operators/_components/zoomable-avatar'
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
const COMMENTS_PER_POST = 5

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
  const feed = await getFeed(viewer?.id ?? null, cursor?.trim() || null, PAGE_SIZE, starterView ? { starterSegment: starterView.segment } : {})
  const starter = await loadStarterFeed()
  const starterOrder = new Map((starterView && starter ? starter[starterView.segment] : []).map((id, index) => [id, index + 1]))

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
  const comments = postIds.length
    ? await prisma.postComment.findMany({
        where: { postId: { in: postIds }, moderationHiddenAt: null, author: visibleCommentsWhere(postIds[0], viewer?.id ?? null).author },
        orderBy: { createdAt: 'asc' },
        select: { id: true, postId: true, sourceText: true, parentId: true, author: { select: { name: true, image: true } } },
      })
    : []
  const commentsByPost = new Map<string, typeof comments>()
  for (const comment of comments) commentsByPost.set(comment.postId, [...(commentsByPost.get(comment.postId) ?? []), comment])
  const statsByPost = await loadOperatorPostStats({ postIds: feed.posts.filter((post) => post.author.isOperator).map((post) => post.id) })

  const now = new Date()
  const query = (params: Record<string, string | null>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
    const text = search.toString()
    return text ? `/admin/feed?${text}` : '/admin/feed'
  }

  return (
    <OperatorsMain>
      <h1 className="text-xl font-bold text-slate-900">피드 미리보기</h1>
      <p className="mt-1 text-sm text-slate-500">앱 홈 피드와 같은 추천 순서입니다. 보기만 하며 조회 기록은 남지 않습니다. 신규 한국인·외국인은 막 가입한 유저가 보는 순서이고, 번호는 정해 둔 첫 피드 순서입니다. 운영 계정 글의 반응 숫자는 실사용자만 센 것이고, %는 조회 대비입니다.</p>

      <nav className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 pb-1" aria-label="누구의 피드로 볼지">
        <Link
          href={query({})}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${viewer || starterView ? 'border-slate-200 bg-white text-slate-600' : 'border-sky-600 bg-sky-600 text-white'}`}
        >
          비로그인
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

      {feed.posts.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">보여 줄 글이 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {feed.posts.map((post) => {
            const postComments = commentsByPost.get(post.id) ?? []
            return (
              <li key={post.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                {starterOrder.has(post.id) ? (
                  <p className="mb-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">첫 피드 {starterOrder.get(post.id)}번</p>
                ) : null}
                <div className="flex items-center gap-3">
                  <ZoomableAvatar image={post.author.image} name={post.author.name} size={40} languages={authorLanguages.get(post.author.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{post.author.name || '이름 없음'}</p>
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
                      { src: `/api/posts/${post.id}/image?k=${encodeURIComponent(post.imageObjectKey.slice(-16))}`, width: post.imageWidth, height: post.imageHeight },
                      ...post.extraImages.map((image) => ({ src: `/api/posts/${post.id}/image?index=${image.position}`, width: image.imageWidth, height: image.imageHeight })),
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
                  <OperatorPostEditor key={`${post.id}:${post.bodyVersion}`} postId={post.id} text={post.sourceText} hasPhoto={Boolean(post.imageObjectKey)} language={post.sourceLanguage} />
                ) : null}

                <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1"><Heart className="h-4 w-4" aria-hidden="true" />{post.likeCount}</span>
                  <Link href={`/admin/activity/posts/${post.id}`} className="inline-flex items-center gap-1">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />{post.commentCount}
                  </Link>
                </div>
                <OperatorPostStatsRow stats={statsByPost.get(post.id)} className="mt-2" />

                {postComments.length ? (
                  <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {postComments.slice(0, COMMENTS_PER_POST).map((comment) => (
                      <li key={comment.id} className={`flex items-start gap-2 ${comment.parentId ? 'pl-8' : ''}`}>
                        <ZoomableAvatar image={comment.author.image} name={comment.author.name} size={24} />
                        <p className="min-w-0 flex-1 break-words text-sm text-slate-800">
                          <span className="font-semibold">{comment.author.name || '이름 없음'}</span> {comment.sourceText}
                        </p>
                      </li>
                    ))}
                    {postComments.length > COMMENTS_PER_POST ? (
                      <li><Link href={`/admin/activity/posts/${post.id}`} className="text-xs font-medium text-sky-700">댓글 {postComments.length}개 모두 보기</Link></li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {feed.nextCursor ? (
        <Link
          href={query({ as: viewer?.id ?? starterView?.key ?? null, cursor: feed.nextCursor })}
          className="mt-3 flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 active:bg-slate-100"
        >
          다음 글 보기
        </Link>
      ) : null}
    </OperatorsMain>
  )
}
