import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Grid3x3, List } from 'lucide-react'
import ProfileLanguageLevels from '@/components/profile-language-levels'
import { prisma } from '@/lib/prisma'
import { zipInterestLanguages } from '@/lib/interest-languages'
import { requireAdmin } from '@/server/admin/guard'
import { ageOn } from '@/server/operator-auto-reply/generate'
import { listReviewQueue } from '@/server/operator-review/review'
import { loadOperatorPostStats } from '@/server/operator-post-stats/load'
import { OperatorPostStatsRow } from '../../../_components/operator-post-stats-row'
import { OperatorPostEditor } from '../../../feed/_components/operator-post-editor'
import { PostTakedownButton } from '../../../feed/_components/post-takedown-button'
import { OperatorAvatar, OperatorsMain } from '../../_components/operator-ui'
import { ReviewBoard, ReviewPhotos, reviewImageUrl } from '../../review/review-board'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '운영 계정 프로필 · HashChat Admin',
  robots: { index: false, follow: false },
}

const MAX_PUBLISHED = 300
/** `is_deleted` is null on most rows, which `{ not: true }` would leave out. */
const NOT_DELETED = { OR: [{ isDeleted: null }, { isDeleted: false }] }

const DATE_FORMAT = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const REVIEW_STATE: Record<string, string> = {
  pending: '계정 검토 중',
  drawing: '프로필 사진 그리는 중',
  regenerating: '계정 다시 만드는 중',
  approved: '게시된 계정',
}

type Tab = 'published' | 'review'
type View = 'grid' | 'list'

type ProfilePageProps = {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ tab?: string; view?: string; after?: string }>
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** One square of the grid: the first photo, or the opening of the text. */
function Tile({ href, image, text, badge, dimmed }: { href: string; image: string | null; text: string; badge?: string | null; dimmed?: boolean }) {
  return (
    <Link href={href} className={`relative block aspect-square overflow-hidden bg-slate-100 ${dimmed ? 'opacity-50' : ''}`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-2 text-center text-[12px] leading-4 text-slate-700">
          <span className="line-clamp-5 break-words">{text}</span>
        </span>
      )}
      {badge ? <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{badge}</span> : null}
    </Link>
  )
}

/**
 * An operator account seen as the app's My Page shows it: the profile on top,
 * then its published posts and the ones waiting in review, as a grid or as
 * full cards (review cards keep their review actions).
 */
export default async function OperatorProfilePage({ params, searchParams }: ProfilePageProps) {
  const { userId: rawUserId } = await params
  const userId = decodeSegment(rawUserId).trim()
  await requireAdmin(`/admin/operators/${rawUserId}/profile`)
  const query = await searchParams
  const tab: Tab = query.tab === 'review' ? 'review' : 'published'
  const view: View = query.view === 'list' ? 'list' : 'grid'

  const user = await prisma.user.findFirst({
    where: { id: userId, isOperator: true },
    select: {
      id: true, name: true, handle: true, image: true, bio: true, birthDate: true, locationCity: true, locationCountry: true,
      primaryLanguages: true, interestLanguages: true, interestLanguageLevels: true, isDeleted: true,
      operatorAccount: { select: { personaGender: true, reviewState: true } },
      _count: { select: { followerRelations: true, followingRelations: true } },
    },
  })
  if (!user) notFound()

  const [publishedCount, reviewCount, published, queue] = await Promise.all([
    prisma.post.count({ where: { authorId: user.id, ...NOT_DELETED } }),
    prisma.operatorPostReserve.count({ where: { operatorUserId: user.id, state: { in: ['review', 'regenerating'] } } }),
    tab === 'published'
      ? prisma.post.findMany({
        where: { authorId: user.id, ...NOT_DELETED },
        orderBy: { publishedAt: 'desc' },
        take: MAX_PUBLISHED,
        select: {
          id: true, sourceText: true, sourceLanguage: true, publishedAt: true, likeCount: true, commentCount: true, bodyVersion: true,
          imageObjectKey: true, imageWidth: true, imageHeight: true, moderationHiddenAt: true,
          extraImages: { orderBy: { position: 'asc' }, select: { imageObjectKey: true, imageWidth: true, imageHeight: true } },
          comments: {
            where: { moderationHiddenAt: null },
            orderBy: { createdAt: 'asc' },
            take: 5,
            select: { id: true, sourceText: true, author: { select: { name: true, isOperator: true } } },
          },
        },
      })
      : Promise.resolve([]),
    tab === 'review' ? listReviewQueue({ userId: user.id, cursor: query.after || undefined }) : Promise.resolve(null),
  ])

  // The full cards (list view) carry each post's stats row.
  const statsByPost = await loadOperatorPostStats({ postIds: view === 'list' ? published.map((post) => post.id) : [] })
  const base = `/admin/operators/${encodeURIComponent(user.id)}/profile`
  const href = (next: { tab?: Tab; view?: View; after?: string }, anchor?: string) => {
    const params = new URLSearchParams({ tab: next.tab ?? tab, view: next.view ?? view })
    if (next.after) params.set('after', next.after)
    return `${base}?${params.toString()}${anchor ? `#${anchor}` : ''}`
  }
  const primaryLanguages = user.primaryLanguages
  const interestLanguages = zipInterestLanguages(user.interestLanguages, user.interestLanguageLevels).filter((entry) => !primaryLanguages.includes(entry.code))
  const age = ageOn(user.birthDate, new Date())
  const facts = [
    age ? `${age}세` : null,
    user.operatorAccount?.personaGender === 'female' ? '여성' : user.operatorAccount?.personaGender === 'male' ? '남성' : null,
    [user.locationCity, user.locationCountry].filter(Boolean).join(', ') || null,
  ].filter(Boolean)
  const reviewState = user.operatorAccount?.reviewState ?? 'approved'
  const reviewPosts = queue?.items.filter((item) => item.kind === 'post') ?? []
  const tabClass = (active: boolean) => `flex-1 border-b-2 py-3 text-center text-sm font-semibold ${active ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400'}`
  const viewClass = (active: boolean) => `flex h-9 w-9 items-center justify-center rounded-lg ${active ? 'bg-slate-900 text-white' : 'text-slate-500'}`

  return (
    <OperatorsMain>
      <div className="mx-auto w-full max-w-[520px]">
        <div className="mb-3 flex items-center justify-between text-sm">
          <Link href="/admin/operators/review" className="font-semibold text-sky-700">‹ 검토</Link>
          <Link href={`/admin/operators/${encodeURIComponent(user.id)}?from=review`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">프로필 편집</Link>
        </div>

        {/* Profile header, laid out like the app's My Page. */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-4">
            <OperatorAvatar image={user.image} name={user.name} size={84} languages={primaryLanguages} />
            <div className="grid flex-1 grid-cols-3 text-center">
              <div><p className="text-lg font-bold text-slate-900">{publishedCount}</p><p className="text-xs text-slate-500">게시물</p></div>
              <div><p className="text-lg font-bold text-slate-900">{user._count.followerRelations}</p><p className="text-xs text-slate-500">팔로워</p></div>
              <div><p className="text-lg font-bold text-slate-900">{user._count.followingRelations}</p><p className="text-xs text-slate-500">팔로잉</p></div>
            </div>
          </div>
          <p className="mt-3 text-base font-bold text-slate-900">{user.name ?? '(이름 없음)'}</p>
          <p className="text-sm text-slate-500">@{user.handle}{facts.length ? ` · ${facts.join(' · ')}` : ''}</p>
          {reviewState !== 'approved' || user.isDeleted ? (
            <p className="mt-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{user.isDeleted ? '삭제된 계정' : REVIEW_STATE[reviewState] ?? reviewState}</p>
          ) : null}
          {user.bio ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{user.bio}</p> : null}
          <ProfileLanguageLevels primaryLanguages={primaryLanguages} interestLanguages={interestLanguages} locale="ko" className="mt-3" />
        </section>

        <div className="mt-3 flex items-center gap-2 border-b border-slate-200 bg-white">
          <Link href={href({ tab: 'published', after: undefined })} className={tabClass(tab === 'published')}>올라간 글 {publishedCount}</Link>
          <Link href={href({ tab: 'review', after: undefined })} className={tabClass(tab === 'review')}>검토 대기 {reviewCount}</Link>
          <div className="flex gap-1 pr-2">
            <Link href={href({ view: 'grid' })} className={viewClass(view === 'grid')} aria-label="격자로 보기"><Grid3x3 size={18} /></Link>
            <Link href={href({ view: 'list' })} className={viewClass(view === 'list')} aria-label="글로 보기"><List size={18} /></Link>
          </div>
        </div>

        {tab === 'published' ? (
          published.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">아직 올라간 글이 없어요.</p>
          ) : view === 'grid' ? (
            <div className="mt-[2px] grid grid-cols-3 gap-[2px]">
              {published.map((post) => (
                <Tile
                  key={post.id}
                  href={href({ view: 'list' }, `post-${post.id}`)}
                  image={post.imageObjectKey ? `/admin/api/posts/${post.id}/image` : null}
                  text={post.sourceText ?? ''}
                  badge={post.moderationHiddenAt ? '내림' : post.extraImages.length ? `${post.extraImages.length + 1}장` : null}
                  dimmed={post.moderationHiddenAt !== null}
                />
              ))}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {published.map((post) => (
                <article key={post.id} id={`post-${post.id}`} className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-3">
                  {post.moderationHiddenAt ? <p className="mb-2 text-xs font-semibold text-rose-700">앱에서 내린 글</p> : null}
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-900">{post.sourceText || '(내용 없음)'}</p>
                  {post.imageObjectKey ? (
                    <ReviewPhotos
                      photos={[
                        { objectKey: post.imageObjectKey, width: post.imageWidth, height: post.imageHeight },
                        ...post.extraImages.map((image) => ({ objectKey: image.imageObjectKey, width: image.imageWidth, height: image.imageHeight })),
                      ]}
                    />
                  ) : null}
                  <p className="mt-2 text-xs text-slate-500">
                    {DATE_FORMAT.format(post.publishedAt)} · {post.sourceLanguage ?? '?'} · 좋아요 {post.likeCount} · 댓글 {post.commentCount}
                  </p>
                  <OperatorPostStatsRow stats={statsByPost.get(post.id)} className="mt-2" />
                  {post.comments.length ? (
                    <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 text-sm">
                      {post.comments.map((comment) => (
                        <li key={comment.id} className="break-words text-slate-700">
                          <span className="font-semibold text-slate-900">{comment.author.name ?? '?'}{comment.author.isOperator ? ' (운영)' : ''}</span> {comment.sourceText}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {post.moderationHiddenAt ? (
                    <div className="mt-3"><PostTakedownButton postId={post.id} hidden /></div>
                  ) : (
                    <OperatorPostEditor key={`${post.id}:${post.bodyVersion}`} postId={post.id} text={post.sourceText} hasPhoto={Boolean(post.imageObjectKey)} />
                  )}
                </article>
              ))}
            </div>
          )
        ) : queue && queue.items.length ? (
          view === 'grid' ? (
            <div className="mt-[2px] grid grid-cols-3 gap-[2px]">
              {reviewPosts.map((item) => item.kind === 'post' ? (
                <Tile
                  key={item.key}
                  href={href({ view: 'list' }, `post-${item.post.id}`)}
                  image={item.post.imageObjectKey ? reviewImageUrl(item.post.imageObjectKey) : null}
                  text={item.post.text}
                  badge={item.post.imageObjectKey ? (item.post.extraImages.length ? `${item.post.extraImages.length + 1}장` : null) : item.post.photoDescription ? '사진 미완' : null}
                />
              ) : null)}
            </div>
          ) : (
            <div className="mt-3">
              <ReviewBoard key={`${user.id}:${query.after ?? ''}:${queue.items.map((item) => item.key).join(',')}`} items={queue.items} />
            </div>
          )
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">검토 대기 중인 글이 없어요.</p>
        )}
        {tab === 'review' && queue?.nextCursor ? (
          <Link href={href({ after: queue.nextCursor })} className="mt-4 block rounded-lg border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-sky-700">
            다음 글 더 보기
          </Link>
        ) : null}
      </div>
    </OperatorsMain>
  )
}
