import Link from 'next/link'
import { Heart } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { FEED_PAGE_SELECT, getFeed, type FeedResult } from '@/server/feed/feed-service'
import { loadStarterFeed, type StarterSegment } from '@/server/feed/starter-feed'
import { loadOperatorPostStats } from '@/server/operator-post-stats/load'
import { visiblePostWhere } from '@/server/posts/post-visibility'
import { OperatorPostStatsRow } from '../_components/operator-post-stats-row'
import { adminProfileHref } from '../_lib/profile-href'
import { InlinePostComments } from '../activity/_components/inline-post-comments'
import { OperatorAvatar } from '../operators/_components/operator-ui'
import { OperatorPostEditor } from './_components/operator-post-editor'
import { PostBody } from './_components/post-body'
import { ZoomableImage } from './_components/zoomable-image'
import { seedreamImageIds } from '@/server/seedream/drawn-images'

/**
 * One page of the admin feed preview: the posts as cards plus the cursor of
 * the next page. The page renders the first; scrolling to the end asks the
 * server action (actions.ts) for the next one and appends it.
 */

const PAGE_SIZE = 20

export const STARTER_VIEWS: ReadonlyArray<{ key: string; segment: StarterSegment; label: string }> = [
  { key: 'new-ko', segment: 'ko', label: '신규 한국인' },
  { key: 'new-foreign', segment: 'foreign', label: '신규 외국인' },
]
/** `as=latest`: every visible post, newest first (not the recommended order). */
export const LATEST_VIEW = 'latest'
/** `as=oldest`: every visible post, oldest first (staff, 2026-11-25). */
export const OLDEST_VIEW = 'oldest'

/** Visible posts by published time, newest (or oldest) first; cursor `<iso>|<id>`. */
async function loadLatestPosts(rawCursor: string | null, oldest = false): Promise<FeedResult> {
  const [iso, id] = (rawCursor ?? '').split('|')
  const at = iso ? new Date(iso) : null
  const beyond = oldest ? 'gt' as const : 'lt' as const
  const after = at && !Number.isNaN(at.getTime()) && id
    ? { AND: [{ OR: [{ publishedAt: { [beyond]: at } }, { publishedAt: at, id: { [beyond]: id } }] }] }
    : {}
  const direction = oldest ? 'asc' as const : 'desc' as const
  const rows = await prisma.post.findMany({
    where: { ...visiblePostWhere(null), ...after },
    orderBy: [{ publishedAt: direction }, { id: direction }],
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

function relativeTime(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000))
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}시간 전`
  return `${Math.floor(minutes / (24 * 60))}일 전`
}

/** Whose feed `as` names: an operator account, a new reader of a segment, the latest posts, or nobody. */
export async function resolveFeedView(as: string | null | undefined) {
  const key = as?.trim() || null
  const starterView = STARTER_VIEWS.find((view) => view.key === key) ?? null
  const oldest = key === OLDEST_VIEW
  const latest = key === LATEST_VIEW || oldest
  const viewer = key && !starterView && !latest
    ? await prisma.user.findFirst({ where: { id: key, isOperator: true, isDeleted: false, isActive: true }, select: { id: true, name: true, handle: true } })
    : null
  return { key: viewer?.id ?? starterView?.key ?? (oldest ? OLDEST_VIEW : latest ? LATEST_VIEW : null), viewer, starterView, latest, oldest }
}

export type FeedView = Awaited<ReturnType<typeof resolveFeedView>>

export async function loadFeedChunk(view: FeedView, cursor: string | null, here: string): Promise<{ node: React.ReactNode; nextCursor: string | null; count: number }> {
  const { viewer, starterView, latest, oldest } = view
  const feed = latest
    ? await loadLatestPosts(cursor, oldest)
    : await getFeed(viewer?.id ?? null, cursor, PAGE_SIZE, starterView ? { starterSegment: starterView.segment } : {})
  const starter = starterView ? await loadStarterFeed() : null
  const listed = starterView && starter ? starter[starterView.segment] : []
  const listedVisible = new Set(listed.length
    ? (await prisma.post.findMany({ where: { id: { in: listed }, ...visiblePostWhere(null) }, select: { id: true } })).map((post) => post.id)
    : [])
  const starterOrder = new Map(listed.filter((id) => listedVisible.has(id)).map((id, index) => [id, index + 1]))

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
  const statsByPost = await loadOperatorPostStats({ postIds: feed.posts.map((post) => post.id), anyAuthor: true })
  // Which engine drew an operator's photo (ChatGPT pool unless listed as Seedream's).
  const seedream = await seedreamImageIds().catch(() => new Set<string>())

  const now = new Date()
  const node = (
    <>
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
                      { src: `/api/posts/${post.id}/image/hashchat-${post.id.slice(-8)}.jpg?k=${encodeURIComponent(post.imageObjectKey.slice(-16))}`, width: post.imageWidth, height: post.imageHeight, key: post.imageObjectKey as string | null },
                      ...post.extraImages.map((image) => ({ src: `/api/posts/${post.id}/image/hashchat-${post.id.slice(-8)}-${image.position}.jpg?index=${image.position}`, width: image.imageWidth, height: image.imageHeight, key: (image as { imageObjectKey?: string | null }).imageObjectKey ?? null })),
                    ].map((photo, index, all) => (
                      <div key={photo.src} className={`relative ${all.length > 1 ? 'w-[85%] shrink-0 snap-center' : 'w-full'}`}>
                        {post.author.isOperator && photo.key ? (
                          <span className={`pointer-events-none absolute left-2 top-2 z-[1] rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${seedream.has(photo.key) ? 'bg-violet-600/85' : 'bg-black/55'}`}>
                            {seedream.has(photo.key) ? 'Seedream' : 'ChatGPT'}
                          </span>
                        ) : null}
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
    </>
  )
  return { node, nextCursor: feed.nextCursor, count: feed.posts.length }
}
