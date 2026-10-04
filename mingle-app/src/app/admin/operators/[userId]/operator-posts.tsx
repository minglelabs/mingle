import Link from 'next/link'
import { prisma } from '@/lib/prisma'

const PREVIEW_COUNT = 20

const DATE_FORMAT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

type OperatorPostsProps = { userId: string; showAll: boolean }

/** Published posts and the waiting reserve of one operator account. */
export async function OperatorPosts({ userId, showAll }: OperatorPostsProps) {
  const take = showAll ? undefined : PREVIEW_COUNT
  const [publishedCount, published, queuedCount, queued] = await Promise.all([
    prisma.post.count({ where: { authorId: userId, isDeleted: { not: true } } }),
    prisma.post.findMany({
      where: { authorId: userId, isDeleted: { not: true } },
      orderBy: { publishedAt: 'desc' },
      take,
      select: { id: true, sourceText: true, publishedAt: true, likeCount: true, commentCount: true },
    }),
    prisma.operatorPostReserve.count({ where: { operatorUserId: userId, state: 'queued' } }),
    prisma.operatorPostReserve.findMany({
      where: { operatorUserId: userId, state: 'queued' },
      orderBy: [{ releaseAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take,
      select: { id: true, text: true, topic: true, releaseAt: true },
    }),
  ])
  const hasMore = !showAll && (publishedCount > published.length || queuedCount > queued.length)

  return (
    <div className="mt-3 space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="올라간 글">
        <h2 className="text-sm font-semibold text-slate-900">올라간 글 {publishedCount.toLocaleString()}개</h2>
        {published.length ? (
          <ul className="mt-2 divide-y divide-slate-100">
            {published.map((post) => (
              <li key={post.id}>
                <Link href={`/admin/activity/posts/${post.id}`} className="block py-3 active:bg-slate-50">
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{post.sourceText || '(내용 없음)'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {DATE_FORMAT.format(post.publishedAt)} · 좋아요 {post.likeCount} · 댓글 {post.commentCount}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">아직 올라간 글이 없습니다.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="대기 중인 글">
        <h2 className="text-sm font-semibold text-slate-900">대기 중인 글 {queuedCount.toLocaleString()}개</h2>
        <p className="mt-0.5 text-xs text-slate-500">위에서부터 차례로 올라갑니다.</p>
        {queued.length ? (
          <ol className="mt-2 divide-y divide-slate-100">
            {queued.map((item) => (
              <li key={item.id} className="py-3">
                <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{item.text}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.releaseAt ? `${DATE_FORMAT.format(item.releaseAt)} 예정` : '시간 미정'}
                  {item.topic ? ` · ${item.topic}` : ''}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-slate-500">대기 중인 글이 없습니다.</p>
        )}
      </section>

      {hasMore ? (
        <Link
          href={`/admin/operators/${encodeURIComponent(userId)}?posts=all`}
          className="flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 active:bg-slate-100"
        >
          전체 보기
        </Link>
      ) : null}
    </div>
  )
}
