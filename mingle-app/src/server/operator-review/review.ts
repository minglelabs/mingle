import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { zipInterestLanguages, type InterestLanguage } from '@/lib/interest-languages'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { ageOn } from '@/server/operator-auto-reply/generate'
import { planOperatorAvatar } from '@/server/operator-avatars/generate'
import { generateReservePosts, pickReserveTopics, reservePosterProfile } from '@/server/operator-post-reserve/generate'
import { drawReservePostImage } from '@/server/operator-post-reserve/post-image'
import { MAX_RESERVE_EXTRA_IMAGES, reserveExtraImages, type ReserveExtraImage } from '@/server/operator-post-reserve/extra-images'
import { decodePostPhoto } from '@/server/operator-post-reserve/post-photo'
import { loadExistingReserveTexts, loadReservePersona, PHOTO_REQUESTED, publishReservePostNow } from '@/server/operator-post-reserve/worker'

/**
 * Staff review of operator profiles and their pre-written posts. A profile
 * waiting for review is an inactive user (hidden from search, profiles and
 * every automation); its posts wait in the `review` state, which the reserve
 * worker never releases. Each item gets one of three answers: 게시 (publish),
 * 삭제 (delete) or 재제작 (redo, optionally with written feedback).
 */

export const REVIEW_ITEMS_PER_PAGE = 20
const MAX_FEEDBACK_LENGTH = 1000

/** `draw`: have the post's photo drawn by hand (in ChatGPT) without changing the text. */
export type ReviewAction = 'publish' | 'delete' | 'regenerate' | 'draw'

export function parseReviewAction(value: unknown): ReviewAction | null {
  return value === 'publish' || value === 'delete' || value === 'regenerate' || value === 'draw' ? value : null
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
  /** The 2nd to 10th photo, after `imageObjectKey`. */
  extraImages: ReserveExtraImage[]
  reviewFeedback: string | null
  error: string | null
  /** The photo is queued to be drawn by hand. */
  photoRequested: boolean
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
  interestLanguages: InterestLanguage[]
  personaGender: string | null
  profileState: string
  profileFeedback: string | null
}

export type ReviewAuthor = {
  userId: string; name: string | null; handle: string; image: string | null; primaryLanguages: string[]
  interestLanguages: InterestLanguage[]; profileState: string
}

/** One card of the review timeline: a new account (at sign-up) or a post (at creation). `pinned`: staff moved it up. */
export type ReviewItem =
  | { kind: 'profile'; key: string; at: string; pinned: boolean; profile: ReviewProfile }
  | { kind: 'post'; key: string; at: string; pinned: boolean; post: ReviewPost; author: ReviewAuthor }

export type ReviewQueue = {
  items: ReviewItem[]
  totalProfiles: number
  totalPosts: number
  /** Cursor for the next page (the last item's key), or null at the end. */
  nextCursor: string | null
}

const POST_SELECT = {
  id: true, text: true, language: true, topic: true, state: true, imagePrompt: true,
  imageObjectKey: true, imageWidth: true, imageHeight: true, extraImages: true, reviewFeedback: true, error: true,
} as const

function toReviewPost(row: {
  id: string; text: string; language: string | null; topic: string | null; state: string; imagePrompt: string | null
  imageObjectKey: string | null; imageWidth: number | null; imageHeight: number | null; extraImages: unknown
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
    extraImages: row.imageObjectKey ? reserveExtraImages(row.extraImages) : [],
    reviewFeedback: row.reviewFeedback,
    error: row.error,
    photoRequested: !row.imageObjectKey && row.error === PHOTO_REQUESTED,
  }
}

const REVIEW_POST_STATES = ['review', 'regenerating']

/**
 * `rank`: the place staff gave the item (lower first); unranked items, the
 * default order, follow every ranked one.
 * `late`: a post without a photo, shown after every account and photo post.
 * `round`: 0 for an account, else the post's place among its author's posts
 * of the same group, so the queue deals one post per account in turn.
 * `authorAt`: the author's sign-up time, the order within a round.
 */
type TimelineRow = { rank: number; late: boolean; round: number; authorAt: Date; kindOrder: number; kind: 'profile' | 'post'; id: string; at: Date; userId: string }

/** Rank of an item staff did not move: after every ranked one. */
const UNRANKED = 2147483647

// A post's round counts every reserve row of its author (any state), so it
// does not shift when staff answer other posts and paging stays stable.
const TIMELINE_SQL = `
  SELECT rank, late, round, "authorAt", "kindOrder", kind, id, at, "userId" FROM (
    SELECT COALESCE(o.review_rank, ${UNRANKED})::bigint AS rank, false AS late, 1::bigint AS round, u.created_at AS "authorAt", 0 AS "kindOrder", 'profile' AS kind, u.id, u.created_at AS at, u.id AS "userId"
    FROM app.app_users u JOIN app.app_operator_accounts o ON o.user_id = u.id
    WHERE u.is_operator AND NOT u.is_deleted AND o.review_state <> 'approved'
    UNION ALL
    SELECT rank, late, round, "authorAt", 1 AS "kindOrder", 'post' AS kind, id, at, "userId" FROM (
      SELECT COALESCE(r.review_rank, ${UNRANKED})::bigint AS rank, r.image_object_key IS NULL AS late,
        ROW_NUMBER() OVER (PARTITION BY r.operator_user_id, r.image_object_key IS NULL ORDER BY r.created_at, r.id) AS round,
        u.created_at AS "authorAt", r.id, r.created_at AS at, r.state, u.is_deleted, r.operator_user_id AS "userId"
      FROM app.app_operator_post_reserve r JOIN app.app_users u ON u.id = r.operator_user_id
    ) p
    WHERE state IN ('review', 'regenerating') AND NOT is_deleted
  ) t`

/** Cursor = `<rank>|<0|1 late>|<round>|<author iso time>|<0 profile, 1 post>|<id>` of the last item shown. */
export function encodeReviewCursor(row: TimelineRow): string {
  return `${row.rank}|${row.late ? 1 : 0}|${row.round}|${row.authorAt.toISOString()}|${row.kindOrder}|${row.id}`
}

export function decodeReviewCursor(value: string | undefined): Pick<TimelineRow, 'rank' | 'late' | 'round' | 'authorAt' | 'kindOrder' | 'id'> | null {
  const [rank, late, round, iso, kindOrder, id] = (value ?? '').split('|')
  const authorAt = new Date(iso ?? '')
  const rankNumber = Number(rank)
  const roundNumber = Number(round)
  if (!id || !Number.isInteger(rankNumber) || (late !== '0' && late !== '1') || (kindOrder !== '0' && kindOrder !== '1') || !Number.isInteger(roundNumber) || roundNumber < 0 || Number.isNaN(authorAt.getTime())) return null
  return { rank: rankNumber, late: late === '1', round: roundNumber, authorAt, kindOrder: Number(kindOrder), id }
}

/**
 * Every account and post waiting for review. Items staff moved up come first,
 * in their order; then the default order: accounts and photo posts come
 * first, then the posts without a photo; within each, one item per account
 * in turn (accounts by sign-up time), so no single account fills a page. An
 * account under review sits in the first turn, right before its first post.
 * Paged by cursor, so items answered on one page never push unseen ones
 * past the next.
 */
export async function listReviewQueue(options: { cursor?: string; now?: Date; userId?: string } = {}): Promise<ReviewQueue> {
  const now = options.now ?? new Date()
  const after = decodeReviewCursor(options.cursor)
  const order = `ORDER BY rank, late, round, "authorAt", "kindOrder", id`
  // `userId`: one account's own items only (its profile page).
  const conditions: string[] = []
  const params: unknown[] = []
  if (after) {
    conditions.push(`(rank, late, round, "authorAt", "kindOrder", id) > ($1::bigint, $2::boolean, $3::bigint, $4::timestamp, $5::int, $6::text)`)
    params.push(after.rank, after.late, after.round, after.authorAt, after.kindOrder, after.id)
  }
  if (options.userId) {
    params.push(options.userId)
    conditions.push(`"userId" = $${params.length}::text`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = (await prisma.$queryRawUnsafe<TimelineRow[]>(`${TIMELINE_SQL} ${where} ${order} LIMIT ${REVIEW_ITEMS_PER_PAGE + 1}`, ...params))
    .map((row) => ({ ...row, rank: Number(row.rank), round: Number(row.round), kindOrder: Number(row.kindOrder) }))
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
        locationCity: true, locationCountry: true, primaryLanguages: true, interestLanguages: true, interestLanguageLevels: true,
        operatorAccount: { select: { personaGender: true, reviewState: true, reviewFeedback: true } },
      },
    }),
    prisma.operatorPostReserve.findMany({
      where: { id: { in: postIds } },
      select: {
        ...POST_SELECT,
        operatorUser: { select: { id: true, name: true, handle: true, image: true, primaryLanguages: true, interestLanguages: true, interestLanguageLevels: true, operatorAccount: { select: { reviewState: true } } } },
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
        kind: 'profile', key, at, pinned: row.rank !== UNRANKED,
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
          interestLanguages: zipInterestLanguages(user.interestLanguages, user.interestLanguageLevels),
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
        kind: 'post', key, at, pinned: row.rank !== UNRANKED,
        post: toReviewPost(post),
        author: {
          userId: author.id, name: author.name, handle: author.handle, image: author.image, primaryLanguages: author.primaryLanguages,
          interestLanguages: zipInterestLanguages(author.interestLanguages, author.interestLanguageLevels)
            .filter((entry) => !author.primaryLanguages.includes(entry.code)),
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
  | { ok: true; state: 'approved' | 'deleted' | 'pending' | 'drawing'; image?: string | null }
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

  // 재제작: a new photo spec (with the feedback) waits to be drawn by hand in
  // ChatGPT (scripts/draw-pending-photos.mts); the current photo stays until then.
  if (account.reviewState === 'drawing') return { ok: false, error: 'busy' }
  const plan = await planOperatorAvatar(userId, { feedback })
  if (!plan) return { ok: false, error: 'regenerate_failed' }
  await prisma.operatorAccount.update({ where: { userId }, data: { reviewState: 'drawing', reviewFeedback: feedback, avatarSpec: plan } })
  await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'regenerate', feedback, drawing: true } })
  return { ok: true, state: 'drawing' }
}

export type PostReviewResult =
  | { ok: true; state: 'published' | 'deleted' | 'review'; postId?: string | null; post?: ReviewPost }
  | { ok: false; error: 'not_found' | 'profile_pending' | 'photo_pending' | 'busy' | 'publish_failed' | 'regenerate_failed' }

/** A 재제작 (text, then a photo through the hand-off route) never takes this long. */
const STALE_REGENERATING_MS = 15 * 60 * 1000

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
  if (row.state === 'regenerating') {
    // A 재제작 whose request died (a deploy restart, a timeout) never puts the
    // row back; past the longest a 재제작 can take, staff may answer it again.
    const released = await prisma.operatorPostReserve.updateMany({
      where: { id: reserveId, state: 'regenerating', updatedAt: { lt: new Date(now.getTime() - STALE_REGENERATING_MS) } },
      data: { state: 'review' },
    })
    if (released.count === 0) return { ok: false, error: 'busy' }
  }
  // Feedback on every answer is kept on the row and in the audit log, not only on 재제작.
  const audit = (decision: string, extra: Record<string, string | boolean | null> = {}) => writeAdminAudit(ctx, {
    action: 'operator_post.review', operatorUserId: row.operatorUserId, targetType: 'reserve', targetId: reserveId, metadata: { decision, feedback, ...extra },
  })

  if (action === 'publish') {
    // The author must be public before anything goes out in their name.
    if (!row.operatorUser.isActive) return { ok: false, error: 'profile_pending' }
    if (row.imagePrompt && !row.imageObjectKey) return { ok: false, error: 'photo_pending' }
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

  if (action === 'draw') {
    if (!row.imagePrompt || row.imageObjectKey) return { ok: false, error: 'not_found' }
    const updated = await prisma.operatorPostReserve.update({
      where: { id: reserveId },
      data: { error: PHOTO_REQUESTED, ...(feedback ? { reviewFeedback: feedback } : {}) },
      select: POST_SELECT,
    })
    await audit('draw')
    return { ok: true, state: 'review', post: toReviewPost(updated) }
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
    // Drawn before it can go out, so staff judge the photo too: here only
    // where a hand-off route exists, else by hand later (photo_pending).
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
        // A photo still to draw is queued for drawing by hand right away.
        error: generated.imagePrompt && !image ? PHOTO_REQUESTED : null,
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

/**
 * Moves one account or post to the front of the review queue (`pinned`), or
 * back into the default order. A pinned item goes ahead of every other one.
 */
export async function setReviewPin(ctx: AdminContext, kind: 'profile' | 'post', id: string, pinned: boolean): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  let rank: number | null = null
  if (pinned) {
    const [row] = await prisma.$queryRaw<Array<{ low: number | null }>>`
      SELECT LEAST(
        (SELECT MIN(review_rank) FROM app.app_operator_accounts),
        (SELECT MIN(review_rank) FROM app.app_operator_post_reserve)
      ) AS low`
    rank = (row?.low ?? 1) - 1
  }
  const updated = kind === 'profile'
    ? await prisma.operatorAccount.updateMany({ where: { userId: id }, data: { reviewRank: rank } })
    : await prisma.operatorPostReserve.updateMany({ where: { id }, data: { reviewRank: rank } })
  if (updated.count === 0) return { ok: false, error: 'not_found' }
  await writeAdminAudit(ctx, {
    action: kind === 'profile' ? 'operator.review_order' : 'operator_post.review_order',
    targetType: kind === 'profile' ? 'user' : 'reserve',
    targetId: id,
    metadata: { pinned, rank },
  })
  return { ok: true }
}

/**
 * Staff edited a post's photos in review: `photos` in order (the first is the
 * post's photo, the rest its extra ones), each one already in the post's
 * author's folder. No photos at all makes it a text post.
 */
export async function setReviewPostPhotos(
  ctx: AdminContext,
  id: string,
  photos: ReserveExtraImage[],
): Promise<{ ok: true; post: ReviewPost } | { ok: false; error: 'not_found' | 'invalid_photos' }> {
  const row = await prisma.operatorPostReserve.findFirst({ where: { id, state: { in: REVIEW_POST_STATES } }, select: { operatorUserId: true } })
  if (!row) return { ok: false, error: 'not_found' }
  const kept = reserveExtraImages(photos).slice(0, MAX_RESERVE_EXTRA_IMAGES + 1)
  const folder = `post-images/${row.operatorUserId}/`
  if (kept.length !== photos.length || kept.some((photo) => !photo.objectKey.startsWith(folder))) return { ok: false, error: 'invalid_photos' }
  const [first, ...rest] = kept
  const updated = await prisma.operatorPostReserve.update({
    where: { id },
    data: first
      ? { imageObjectKey: first.objectKey, imageWidth: first.width, imageHeight: first.height, extraImages: rest.length ? rest : Prisma.DbNull, error: null }
      : { imageObjectKey: null, imageWidth: null, imageHeight: null, extraImages: Prisma.DbNull, imagePrompt: null, error: null },
    select: POST_SELECT,
  })
  await writeAdminAudit(ctx, {
    action: 'operator_post.review_photos',
    targetType: 'reserve',
    targetId: id,
    metadata: { count: kept.length },
  })
  return { ok: true, post: toReviewPost(updated) }
}
