import type { Metadata } from 'next'
import Link from 'next/link'
import { Heart, MessageCircle } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/server/admin/guard'
import { getFeed } from '@/server/feed/feed-service'
import { visibleCommentsWhere } from '@/server/posts/comment-visibility'
import { OperatorAvatar, OperatorsMain } from '../operators/_components/operator-ui'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '피드 미리보기 · Mingle Admin',
  robots: { index: false, follow: false },
}

const PAGE_SIZE = 20
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
  const feed = await getFeed(viewer?.id ?? null, cursor?.trim() || null, PAGE_SIZE)

  const postIds = feed.posts.map((post) => post.id)
  const comments = postIds.length
    ? await prisma.postComment.findMany({
        where: { postId: { in: postIds }, moderationHiddenAt: null, author: visibleCommentsWhere(postIds[0], viewer?.id ?? null).author },
        orderBy: { createdAt: 'asc' },
        select: { id: true, postId: true, sourceText: true, parentId: true, author: { select: { name: true, image: true } } },
      })
    : []
  const commentsByPost = new Map<string, typeof comments>()
  for (const comment of comments) commentsByPost.set(comment.postId, [...(commentsByPost.get(comment.postId) ?? []), comment])

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
      <p className="mt-1 text-sm text-slate-500">앱 홈 피드와 같은 추천 순서입니다. 보기만 하며 조회 기록은 남지 않습니다.</p>

      <nav className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="누구의 피드로 볼지">
        <Link
          href={query({})}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${viewer ? 'border-slate-200 bg-white text-slate-600' : 'border-sky-600 bg-sky-600 text-white'}`}
        >
          비로그인
        </Link>
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
                <div className="flex items-center gap-3">
                  <OperatorAvatar image={post.author.image} name={post.author.name} size={40} />
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

                {post.sourceText ? <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-900">{post.sourceText}</p> : null}
                {post.imageObjectKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/posts/${post.id}/image`}
                    alt="글 사진"
                    width={post.imageWidth ?? undefined}
                    height={post.imageHeight ?? undefined}
                    loading="lazy"
                    className="mt-3 h-auto max-h-[28rem] w-full rounded-xl border border-slate-200 object-cover"
                  />
                ) : null}

                <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1"><Heart className="h-4 w-4" aria-hidden="true" />{post.likeCount}</span>
                  <Link href={`/admin/activity/posts/${post.id}`} className="inline-flex items-center gap-1">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />{post.commentCount}
                  </Link>
                </div>

                {postComments.length ? (
                  <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {postComments.slice(0, COMMENTS_PER_POST).map((comment) => (
                      <li key={comment.id} className={`flex items-start gap-2 ${comment.parentId ? 'pl-8' : ''}`}>
                        <OperatorAvatar image={comment.author.image} name={comment.author.name} size={24} />
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
          href={query({ as: viewer?.id ?? null, cursor: feed.nextCursor })}
          className="mt-3 flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 active:bg-slate-100"
        >
          다음 글 보기
        </Link>
      ) : null}
    </OperatorsMain>
  )
}
