import { prisma } from '@/lib/prisma'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { ageOn } from '@/server/operator-auto-reply/generate'
import { generateOperatorAvatar } from '@/server/operator-avatars/generate'
import { generateReservePosts, pickReserveTopics, reservePosterProfile } from '@/server/operator-post-reserve/generate'
import { drawReservePostImage } from '@/server/operator-post-reserve/post-image'
import { decodePostPhoto } from '@/server/operator-post-reserve/post-photo'
import { loadExistingReserveTexts, loadReservePersona, publishReservePostNow } from '@/server/operator-post-reserve/worker'

/**
 * Staff review of operator profiles and their pre-written posts. A profile
 * waiting for review is an inactive user (hidden from search, profiles and
 * every automation); its posts wait in the `review` state, which the reserve
 * worker never releases. Each item gets one of three answers: 게시 (publish),
 * 삭제 (delete) or 재제작 (redo, optionally with written feedback).
 */

export const REVIEW_ITEMS_PER_PAGE = 20
const MAX_FEEDBACK_LENGTH = 1000

export type ReviewAction = 'publish' | 'delete' | 'regenerate'

export function parseReviewAction(value: unknown): ReviewAction | null {
  return value === 'publish' || value === 'delete' || value === 'regenerate' ? value : null
}

export function normalizeReviewFeedback(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? Array.from(trimmed).slice(0, MAX_FEEDBACK_LENGTH).join('') : null
}

export type ReviewPost = {
  id: string
  text: string
  language: string | null
  topic: string | null
  state: string
  photoKind: string | null
  photoDescription: string | null
  imageObjectKey: string | null
  imageWidth: number | null
  imageHeight: number | null
  reviewFeedback: string | null
  error: string | null
}

export type ReviewProfile = {
  userId: string
  name: string | null
  handle: string
  image: string | null
  bio: string | null
  age: number | null
  city: string | null
  country: string | null
  primaryLanguages: string[]
  personaGender: string | null
  profileState: string
  profileFeedback: string | null
}

export type ReviewAuthor = {
  userId: string; name: string | null; handle: string; image: string | null; primaryLanguages: string[]; profileState: string
}

/** One card of the review timeline: a new account (at sign-up) or a post (at creation). */
export type ReviewItem =
  | { kind: 'profile'; key: string; at: string; profile: ReviewProfile }
  | { kind: 'post'; key: string; at: string; post: ReviewPost; author: ReviewAuthor }

export type ReviewQueue = {
  items: ReviewItem[]
  totalProfiles: number
  totalPosts: number
  /** Cursor for the next page (the last item's key), or null at the end. */
  nextCursor: string | null
}

const POST_SELECT = {
  id: true, text: true, language: true, topic: true, state: true, imagePrompt: true,
  imageObjectKey: true, imageWidth: true, imageHeight: true, reviewFeedback: true, error: true,
} as const

function toReviewPost(row: {
  id: string; text: string; language: string | null; topic: string | null; state: string; imagePrompt: string | null
  imageObjectKey: string | null; imageWidth: number | null; imageHeight: number | null
  reviewFeedback: string | null; error: string | null
}): ReviewPost {
  const photo = row.imagePrompt ? decodePostPhoto(row.imagePrompt) : null
  return {
    id: row.id,
    text: row.text,
    language: row.language,
    topic: row.topic,
    state: row.state,
    photoKind: photo?.kind ?? null,
    photoDescription: photo?.description ?? null,
    imageObjectKey: row.imageObjectKey,
    imageWidth: row.imageWidth,
    imageHeight: row.imageHeight,
    reviewFeedback: row.reviewFeedback,
    error: row.error,
  }
}

const REVIEW_POST_STATES = ['review', 'regenerating']

/** `late`: a post without a photo, shown after every account and photo post. */
type TimelineRow = { late: boolean; kind: 'profile' | 'post'; id: string; at: Date }

const TIMELINE_SQL = `
  SELECT late, kind, id, at FROM (
    SELECT false AS late, 'profile' AS kind, u.id, u.created_at AS at
    FROM app.app_users u JOIN app.app_operator_accounts o ON o.user_id = u.id
    WHERE u.is_operator AND NOT u.is_deleted AND o.review_state <> 'approved'
    UNION ALL
    SELECT r.image_object_key IS NULL AS late, 'post' AS kind, r.id, r.created_at AS at
    FROM app.app_operator_post_reserve r JOIN app.app_users u ON u.id = r.operator_user_id
    WHERE r.state IN ('review', 'regenerating') AND NOT u.is_deleted
  ) t`

/** Cursor = `<0|1 late>|<iso time>|<kind>|<id>` of the last item shown. Profiles sort before posts at the same instant. */
export function encodeReviewCursor(row: TimelineRow): string {
  return `${row.late ? 1 : 0}|${row.at.toISOString()}|${row.kind}|${row.id}`
}

export function decodeReviewCursor(value: string | undefined): TimelineRow | null {
  const [late, iso, kind, id] = (value ?? '').split('|')
  const at = new Date(iso ?? '')
  if (!id || (late !== '0' && late !== '1') || Number.isNaN(at.getTime()) || (kind !== 'profile' && kind !== 'post')) return null
  return { late: late === '1', kind, id, at }
}

/**
 * Every account and post waiting for review on one timeline, oldest first:
 * accounts by sign-up time, posts by creation time. Accounts and photo posts
 * come first, then the posts without a photo. Paged by cursor, so items
 * answered on one page never push unseen ones past the next.
 */
export async function listReviewQueue(options: { cursor?: string; now?: Date } = {}): Promise<ReviewQueue> {
  const now = options.now ?? new Date()
  const after = decodeReviewCursor(options.cursor)
  const order = `ORDER BY late, at, (kind = 'post'), id`
  const rows = after
    ? await prisma.$queryRawUnsafe<TimelineRow[]>(
      `${TIMELINE_SQL} WHERE (late, at, (kind = 'post'), id) > ($1::boolean, $2::timestamp, $3::boolean, $4::text) ${order} LIMIT ${REVIEW_ITEMS_PER_PAGE + 1}`,
      after.late, after.at, after.kind === 'post', after.id,
    )
    : await prisma.$queryRawUnsafe<TimelineRow[]>(`${TIMELINE_SQL} ${order} LIMIT ${REVIEW_ITEMS_PER_PAGE + 1}`)
  const page = rows.slice(0, REVIEW_ITEMS_PER_PAGE)

  const profileIds = page.filter((row) => row.kind === 'profile').map((row) => row.id)
  const postIds = page.filter((row) => row.kind === 'post').map((row) => row.id)
  const [totalProfiles, totalPosts, users, posts] = await Promise.all([
    prisma.operatorAccount.count({ where: { reviewState: { not: 'approved' }, user: { isOperator: true, isDeleted: false } } }),
    prisma.operatorPostReserve.count({ where: { state: { in: REVIEW_POST_STATES }, operatorUser: { isDeleted: false } } }),
    prisma.user.findMany({
      where: { id: { in: profileIds } },
      select: {
        id: true, name: true, handle: true, image: true, bio: true, birthDate: true,
        locationCity: true, locationCountry: true, primaryLanguages: true,
        operatorAccount: { select: { personaGender: true, reviewState: true, reviewFeedback: true } },
      },
    }),
    prisma.operatorPostReserve.findMany({
      where: { id: { in: postIds } },
      select: {
        ...POST_SELECT,
        operatorUser: { select: { id: true, name: true, handle: true, image: true, primaryLanguages: true, operatorAccount: { select: { reviewState: true } } } },
      },
    }),
  ])
  const usersById = new Map(users.map((user) => [user.id, user]))
  const postsById = new Map(posts.map((post) => [post.id, post]))

  const items: ReviewItem[] = []
  for (const row of page) {
    const key = encodeReviewCursor(row)
    const at = row.at.toISOString()
    if (row.kind === 'profile') {
      const user = usersById.get(row.id)
      if (!user) continue
      items.push({
        kind: 'profile', key, at,
        profile: {
          userId: user.id,
          name: user.name,
          handle: user.handle,
          image: user.image,
          bio: user.bio,
          age: ageOn(user.birthDate, now),
          city: user.locationCity,
          country: user.locationCountry,
          primaryLanguages: user.primaryLanguages,
          personaGender: user.operatorAccount?.personaGender ?? null,
          profileState: user.operatorAccount?.reviewState ?? 'approved',
          profileFeedback: user.operatorAccount?.reviewFeedback ?? null,
        },
      })
    } else {
      const post = postsById.get(row.id)
      if (!post) continue
      const author = post.operatorUser
      items.push({
        kind: 'post', key, at,
        post: toReviewPost(post),
        author: {
          userId: author.id, name: author.name, handle: author.handle, image: author.image, primaryLanguages: author.primaryLanguages,
          profileState: author.operatorAccount?.reviewState ?? 'approved',
        },
      })
    }
  }

  return {
    items,
    totalProfiles,
    totalPosts,
    nextCursor: rows.length > REVIEW_ITEMS_PER_PAGE && page.length ? encodeReviewCursor(page[page.length - 1]) : null,
  }
}

export type ProfileReviewResult =
  | { ok: true; state: 'approved' | 'deleted' | 'pending'; image?: string | null }
  | { ok: false; error: 'not_found' | 'already_approved' | 'busy' | 'regenerate_failed' }

/** 게시 / 삭제 / 재제작 for a profile waiting for review. */
export async function reviewOperatorProfile(
  ctx: AdminContext | null,
  userId: string,
  action: ReviewAction,
  feedback: string | null,
): Promise<ProfileReviewResult> {
  const account = await prisma.operatorAccount.findUnique({
    where: { userId },
    select: { reviewState: true, user: { select: { isOperator: true, isDeleted: true } } },
  })
  if (!account || !account.user.isOperator || account.user.isDeleted) return { ok: false, error: 'not_found' }
  if (account.reviewState === 'approved') return { ok: false, error: 'already_approved' }

  if (action === 'publish') {
    await prisma.$transaction([
      prisma.operatorAccount.update({ where: { userId }, data: { reviewState: 'approved', ...(feedback ? { reviewFeedback: feedback } : {}) } }),
      prisma.user.update({ where: { id: userId }, data: { isActive: true } }),
    ])
    await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'publish', feedback } })
    return { ok: true, state: 'approved' }
  }

  if (action === 'delete') {
    // Never public, so nothing else refers to it; its reserve rows go with it.
    await prisma.user.delete({ where: { id: userId } })
    await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'delete', feedback } })
    return { ok: true, state: 'deleted' }
  }

  const claimed = await prisma.operatorAccount.updateMany({
    where: { userId, reviewState: 'pending' },
    data: { reviewState: 'regenerating', reviewFeedback: feedback },
  })
  if (claimed.count === 0) return { ok: false, error: 'busy' }
  try {
    const result = await generateOperatorAvatar(ctx, userId, { feedback })
    await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'regenerate', ok: result.ok } })
    if (!result.ok) return { ok: false, error: 'regenerate_failed' }
    return { ok: true, state: 'pending', image: result.image }
  } finally {
    await prisma.operatorAccount.updateMany({ where: { userId, reviewState: 'regenerating' }, data: { reviewState: 'pending' } })
  }
}

export type PostReviewResult =
  | { ok: true; state: 'published' | 'deleted' | 'review'; postId?: string | null; post?: ReviewPost }
  | { ok: false; error: 'not_found' | 'profile_pending' | 'busy' | 'publish_failed' | 'regenerate_failed' }

/** 게시 / 삭제 / 재제작 for a post waiting for review. */
export async function reviewOperatorPost(
  ctx: AdminContext | null,
  reserveId: string,
  action: ReviewAction,
  feedback: string | null,
  now: Date = new Date(),
): Promise<PostReviewResult> {
  const row = await prisma.operatorPostReserve.findUnique({
    where: { id: reserveId },
    select: { ...POST_SELECT, operatorUserId: true, operatorUser: { select: { isActive: true } } },
  })
  if (!row || !REVIEW_POST_STATES.includes(row.state)) return { ok: false, error: 'not_found' }
  if (row.state === 'regenerating') return { ok: false, error: 'busy' }
  // Feedback on every answer is kept on the row and in the audit log, not only on 재제작.
  const audit = (decision: string, extra: Record<string, string | boolean | null> = {}) => writeAdminAudit(ctx, {
    action: 'operator_post.review', operatorUserId: row.operatorUserId, targetType: 'reserve', targetId: reserveId, metadata: { decision, feedback, ...extra },
  })

  if (action === 'publish') {
    // The author must be public before anything goes out in their name.
    if (!row.operatorUser.isActive) return { ok: false, error: 'profile_pending' }
    if (feedback) await prisma.operatorPostReserve.update({ where: { id: reserveId }, data: { reviewFeedback: feedback } })
    const result = await publishReservePostNow(reserveId, 'review', now)
    if (!result.ok) return { ok: false, error: result.error === 'reserve_empty' ? 'not_found' : 'publish_failed' }
    await audit('publish', { postId: result.postId })
    return { ok: true, state: 'published', postId: result.postId }
  }

  if (action === 'delete') {
    const cancelled = await prisma.operatorPostReserve.updateMany({ where: { id: reserveId, state: 'review' }, data: { state: 'cancelled', releaseAt: null, ...(feedback ? { reviewFeedback: feedback } : {}) } })
    if (cancelled.count === 0) return { ok: false, error: 'busy' }
    await audit('delete')
    return { ok: true, state: 'deleted' }
  }

  const claimed = await prisma.operatorPostReserve.updateMany({
    where: { id: reserveId, state: 'review' },
    data: { state: 'regenerating', reviewFeedback: feedback },
  })
  if (claimed.count === 0) return { ok: false, error: 'busy' }
  try {
    const persona = await loadReservePersona(row.operatorUserId, now, { includeInactive: true })
    if (!persona) throw new Error('persona_unavailable')
    const [generated] = await generateReservePosts({
      persona,
      topics: [row.topic ?? pickReserveTopics(1, Math.random, reservePosterProfile(row.operatorUserId).topicFactors)[0]],
      existingTexts: await loadExistingReserveTexts(row.operatorUserId),
      seed: row.operatorUserId,
      revision: { previousText: row.text, feedback },
    })
    if (!generated) throw new Error('nothing_generated')
    // Drawn now, so staff judge the photo too before it can go out.
    const image = generated.imagePrompt ? await drawReservePostImage(row.operatorUserId, generated.imagePrompt) : null
    const updated = await prisma.operatorPostReserve.update({
      where: { id: reserveId },
      data: {
        state: 'review',
        text: generated.text,
        topic: generated.topic,
        language: generated.language === persona.language ? null : generated.language,
        imagePrompt: generated.imagePrompt,
        imageObjectKey: image?.objectKey ?? null,
        imageWidth: image?.width ?? null,
        imageHeight: image?.height ?? null,
        error: generated.imagePrompt && !image ? 'photo_not_drawn' : null,
      },
      select: POST_SELECT,
    })
    await audit('regenerate', { photo: generated.imagePrompt ? Boolean(image) : null })
    return { ok: true, state: 'review', post: toReviewPost(updated) }
  } catch (error) {
    await prisma.operatorPostReserve.updateMany({
      where: { id: reserveId, state: 'regenerating' },
      data: { state: 'review', error: error instanceof Error ? error.message.slice(0, 300) : 'regenerate_failed' },
    })
    await audit('regenerate', { ok: false })
    return { ok: false, error: 'regenerate_failed' }
  }
}
