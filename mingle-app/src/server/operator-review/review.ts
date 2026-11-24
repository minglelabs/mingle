import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { zipInterestLanguages, type InterestLanguage } from '@/lib/interest-languages'
import { canonicalizeSttLanguageCode } from '@/lib/stt-languages'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { ageOn } from '@/server/operator-auto-reply/generate'
import { canDrawImagesHere, generateOperatorAvatar, planOperatorAvatar, type AvatarReference } from '@/server/operator-avatars/generate'
import { generateReservePosts, isKoreaCountry, pickReserveTopics, reservePosterProfile, rewriteReservePostText } from '@/server/operator-post-reserve/generate'
import { drawReservePostImage, type RedrawContext } from '@/server/operator-post-reserve/post-image'
import { MAX_RESERVE_EXTRA_IMAGES, reserveExtraImages, type ReserveExtraImage } from '@/server/operator-post-reserve/extra-images'
import { decodePostPhoto } from '@/server/operator-post-reserve/post-photo'
import { pickScheduledPublishAt } from '@/server/operator-post-reserve/schedule'
import { loadExistingReserveTexts, loadReservePersona, PHOTO_REQUESTED, publishReservePostNow } from '@/server/operator-post-reserve/worker'
import { applyAvatarCandidate, candidateDrawing, discardAvatarCandidate } from '@/server/operators/avatar-candidate'

/**
 * Staff review of operator profiles and their pre-written posts. A profile
 * waiting for review is an inactive user (hidden from search, profiles and
 * every automation); its posts wait in the `review` state, which the reserve
 * worker never releases. Each item gets one of three answers: 게시 (publish),
 * 삭제 (delete) or 재제작 (redo, optionally with written feedback).
 */

export const REVIEW_ITEMS_PER_PAGE = 20
/** The pool could not draw the photo just now; the draw button stays, to try again. */
const PHOTO_DRAW_FAILED = 'photo_draw_failed'
/** The pool is drawing the photo in the background (the row is `regenerating`). */
const PHOTO_DRAWING = 'photo_drawing'
/** 재제작 is rewriting the text (the row is `regenerating`); the photo is drawn after. */
const TEXT_REWRITING = 'text_rewriting'

/**
 * The 재제작 / drawing jobs this process is running right now. A row marked
 * `regenerating` / `drawing` with no job here was cut off (a restart, a crash)
 * and nothing will ever finish it, so it is put back instead of answering
 * "busy": busy means a job is really running.
 */
// On globalThis: every route and page module of this process sees the same jobs,
// so a page or poll served by another bundle never mistakes a running job for a cut-off one.
const runningHere: Set<string> = ((globalThis as { __operatorReviewJobs?: Set<string> }).__operatorReviewJobs ??= new Set<string>())
const postJob = (reserveId: string) => `post:${reserveId}`
const profileJob = (userId: string) => `profile:${userId}`

/** Puts a post whose job is not running here back in review; true when it was cut off. */
async function releaseIfCutOff(reserveId: string): Promise<boolean> {
  if (runningHere.has(postJob(reserveId))) return false
  const drawing = await prisma.operatorPostReserve.updateMany({
    where: { id: reserveId, state: 'regenerating', error: PHOTO_DRAWING },
    data: { state: 'review', error: PHOTO_DRAW_FAILED },
  })
  const rewriting = await prisma.operatorPostReserve.updateMany({
    where: { id: reserveId, state: 'regenerating' },
    data: { state: 'review', error: null },
  })
  return drawing.count + rewriting.count > 0
}

/** Same for an account whose new photo is drawn by the pool: back to pending when no job runs here. */
async function releaseProfileIfCutOff(userId: string): Promise<boolean> {
  if (!canDrawImagesHere() || runningHere.has(profileJob(userId))) return false
  const released = await prisma.operatorAccount.updateMany({ where: { userId, reviewState: 'drawing' }, data: { reviewState: 'pending' } })
  return released.count > 0
}

/**
 * Draws a post's photo through the pool after the request has answered, and
 * puts the row back in review with the photo, or marked failed so the draw
 * button stays. Never throws.
 */
async function drawPostPhotoInBackground(reserveId: string, operatorUserId: string, description: string, onDrawn: () => Promise<unknown>, onFailed: () => Promise<unknown>, staffReference?: AvatarReference, context?: RedrawContext): Promise<void> {
  try {
    const image = await drawReservePostImage(operatorUserId, description, staffReference, context)
    await prisma.operatorPostReserve.updateMany({
      where: { id: reserveId, state: 'regenerating' },
      data: image
        ? { state: 'review', imageObjectKey: image.objectKey, imageWidth: image.width, imageHeight: image.height, error: null }
        : { state: 'review', error: PHOTO_DRAW_FAILED },
    })
    await (image ? onDrawn() : onFailed())
  } catch (error) {
    console.warn('[operator-review] background_draw_failed', { reserveId, error: error instanceof Error ? error.name : 'unknown' })
    await prisma.operatorPostReserve.updateMany({ where: { id: reserveId, state: 'regenerating' }, data: { state: 'review', error: PHOTO_DRAW_FAILED } }).catch(() => {})
  } finally {
    runningHere.delete(postJob(reserveId))
  }
}

/**
 * At server start: a background drawing lives only in the process that
 * started it, so after a deploy or restart nothing will finish the rows it
 * left `regenerating`. Put them back in review as failed, so the card stops
 * waiting and the draw button returns. Never throws.
 */
export async function releaseOrphanedDrawings(): Promise<number> {
  try {
    const drawings = await prisma.operatorPostReserve.updateMany({
      where: { state: 'regenerating', error: PHOTO_DRAWING },
      data: { state: 'review', error: PHOTO_DRAW_FAILED },
    })
    // A rewrite cut off mid-way keeps its old text; it only goes back to review.
    const rewrites = await prisma.operatorPostReserve.updateMany({ where: { state: 'regenerating' }, data: { state: 'review', error: null } })
    // 게시 runs in the background too (publishReservePostNow); one cut off by a
    // restart goes back to review. Queued posts always carry a releaseAt, so
    // only posts taken from review match. A post that did go out is matched by
    // its clientPostId on the next 게시 and settles as published.
    const publishes = await prisma.operatorPostReserve.updateMany({
      where: { state: 'publishing', releaseAt: null },
      data: { state: 'review', error: 'publish_interrupted' },
    })
    const released = { count: drawings.count + rewrites.count + publishes.count }
    if (released.count) console.warn('[operator-review] released_orphaned_drawings', { count: released.count })
    return released.count
  } catch (error) {
    console.warn('[operator-review] release_orphaned_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return 0
  }
}

/** One post of the review queue as its card shows it, for the card to poll while its photo is drawn. */
export async function getReviewPost(reserveId: string): Promise<ReviewPost | null> {
  let row = await prisma.operatorPostReserve.findUnique({ where: { id: reserveId }, select: POST_SELECT })
  if (row?.state === 'regenerating' && (await releaseIfCutOff(reserveId))) {
    row = await prisma.operatorPostReserve.findUnique({ where: { id: reserveId }, select: POST_SELECT })
  }
  return row ? toReviewPost(row) : null
}

/** A profile's review state and photo, for its card to poll while a new photo is drawn. */
export async function getReviewProfileState(userId: string): Promise<{ profileState: string; image: string | null } | null> {
  const account = await prisma.operatorAccount.findUnique({ where: { userId }, select: { reviewState: true, pendingImage: true, pendingDrawingAt: true, user: { select: { image: true } } } })
  if (!account) return null
  // A live account's new photo: the card shows the photo waiting for review.
  if (account.reviewState === 'approved') {
    if (account.pendingDrawingAt && !candidateDrawing(account.pendingDrawingAt)) {
      await prisma.operatorAccount.updateMany({ where: { userId, pendingDrawingAt: account.pendingDrawingAt }, data: { pendingDrawingAt: null } })
    }
    return { profileState: candidateDrawing(account.pendingDrawingAt) ? 'drawing' : 'pending', image: account.pendingImage }
  }
  const cutOff = account.reviewState === 'drawing' && (await releaseProfileIfCutOff(userId))
  return { profileState: cutOff ? 'pending' : account.reviewState, image: account.user.image }
}
const MAX_FEEDBACK_LENGTH = 1000

/** `draw`: have the post's photo drawn by hand (in ChatGPT) without changing the text. */
/** `redraw_photo`: draw the photo again (text untouched), with the text, persona and the photo it replaces. */
export type ReviewAction = 'publish' | 'delete' | 'regenerate' | 'draw' | 'redraw_photo'

export function parseReviewAction(value: unknown): ReviewAction | null {
  return value === 'publish' || value === 'delete' || value === 'regenerate' || value === 'draw' || value === 'redraw_photo' ? value : null
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
  /** The pool is drawing the photo right now (the card polls). */
  photoDrawing: boolean
  /** Scheduled by staff: the post goes out by itself at this time. */
  scheduledAt: string | null
  /** 재제작 is rewriting the text right now (the card polls; the photo follows). */
  rewriting: boolean
  /** The pool's last try at the photo failed; drawing it again is allowed. */
  photoDrawFailed: boolean
  /** The time staff set for the post to be dated at when published (ISO); null: a random time between writing and 게시. */
  publishAt: string | null
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
  /** A live account's new profile photo waiting for review (`image` = the current one); null for a new account. */
  candidate: { image: string | null; drawing: boolean } | null
}

export type ReviewAuthor = {
  userId: string; name: string | null; handle: string; image: string | null; primaryLanguages: string[]
  interestLanguages: InterestLanguage[]; profileState: string
}

/** One card of the review timeline: a new account (at sign-up) or a post (at creation). `pinned`: staff moved it up. */
export type ReviewItem =
  | { kind: 'profile'; key: string; at: string; pinned: boolean; profile: ReviewProfile }
  | { kind: 'post'; key: string; at: string; pinned: boolean; fromReference: boolean; post: ReviewPost; author: ReviewAuthor }

export type ReviewQueue = {
  items: ReviewItem[]
  totalProfiles: number
  totalPosts: number
  /** Cursor for the next page (the last item's key), or null at the end. */
  nextCursor: string | null
}

const POST_SELECT = {
  id: true, text: true, language: true, topic: true, state: true, imagePrompt: true,
  imageObjectKey: true, imageWidth: true, imageHeight: true, extraImages: true, reviewFeedback: true, error: true, releaseAt: true,
} as const

function toReviewPost(row: {
  id: string; text: string; language: string | null; topic: string | null; state: string; imagePrompt: string | null
  imageObjectKey: string | null; imageWidth: number | null; imageHeight: number | null; extraImages: unknown
  reviewFeedback: string | null; error: string | null; releaseAt?: Date | null
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
    photoDrawing: row.state === 'regenerating' && row.error === PHOTO_DRAWING,
    rewriting: row.state === 'regenerating' && row.error !== PHOTO_DRAWING,
    photoDrawFailed: !row.imageObjectKey && row.error === PHOTO_DRAW_FAILED,
    // In review, release_at only holds the (past) time staff set; once scheduled, it is when the post goes out.
    publishAt: row.state !== 'scheduled' && row.releaseAt ? row.releaseAt.toISOString() : null,
    scheduledAt: row.state === 'scheduled' && row.releaseAt ? row.releaseAt.toISOString() : null,
  }
}

/** For tests: how a row shows on its card. */
export const toReviewPostForTest = toReviewPost

const REVIEW_POST_STATES = ['review', 'regenerating']

/**
 * `rank`: the place staff gave the item (lower first); unranked items, the
 * default order, follow every ranked one.
 * `late`: a post without a photo, shown after every account and photo post.
 * `round`: 0 for an account, else the post's place among its author's posts
 * of the same group, so the queue deals one post per account in turn.
 * `authorAt`: the author's sign-up time, the order within a round.
 */
type TimelineRow = { rank: number; ref: number; late: boolean; round: number; authorAt: Date; kindOrder: number; kind: 'profile' | 'post'; id: string; at: Date; userId: string }

/** Rank of an item staff did not move: after every ranked one. */
const UNRANKED = 2147483647

// A post's round counts every reserve row of its author (any state), so it
// does not shift when staff answer other posts and paging stays stable.
/** Post photos drawn from the reference library (library.ts, markReferenceImage). */
const REFERENCE_IMAGE_KEYS_SQL = `SELECT e->'usedBy'->>'imageKey' FROM app.app_admin_settings s, jsonb_array_elements(s.value->'items') e WHERE s.key = 'reference_library' AND e->'usedBy'->>'imageKey' IS NOT NULL`

const TIMELINE_SQL = `
  SELECT rank, ref, late, round, "authorAt", "kindOrder", kind, id, at, "userId" FROM (
    SELECT COALESCE(o.review_rank, ${UNRANKED})::bigint AS rank, 1 AS ref, false AS late, 1::bigint AS round, u.created_at AS "authorAt", 0 AS "kindOrder", 'profile' AS kind, u.id, u.created_at AS at, u.id AS "userId"
    FROM app.app_users u JOIN app.app_operator_accounts o ON o.user_id = u.id
    WHERE u.is_operator AND NOT u.is_deleted AND (o.review_state <> 'approved' OR o.pending_image IS NOT NULL OR o.pending_drawing_at IS NOT NULL)
    UNION ALL
    SELECT rank, ref, late, round, "authorAt", 1 AS "kindOrder", 'post' AS kind, id, at, "userId" FROM (
      SELECT COALESCE(r.review_rank, ${UNRANKED})::bigint AS rank,
        CASE WHEN r.image_object_key IN (${REFERENCE_IMAGE_KEYS_SQL}) THEN 0 ELSE 1 END AS ref,
        r.image_object_key IS NULL AS late,
        ROW_NUMBER() OVER (PARTITION BY r.operator_user_id, r.image_object_key IS NULL ORDER BY r.created_at, r.id) AS round,
        u.created_at AS "authorAt", r.id, r.created_at AS at, r.state, u.is_deleted, r.operator_user_id AS "userId"
      FROM app.app_operator_post_reserve r JOIN app.app_users u ON u.id = r.operator_user_id
    ) p
    WHERE state IN ('review', 'regenerating', 'scheduled') AND NOT is_deleted
  ) t`

/** Cursor = `<rank>|<0 reference, 1 other>|<0|1 late>|<round>|<author iso time>|<0 profile, 1 post>|<id>` of the last item shown. */
export function encodeReviewCursor(row: TimelineRow): string {
  return `${row.rank}|${row.ref}|${row.late ? 1 : 0}|${row.round}|${row.authorAt.toISOString()}|${row.kindOrder}|${row.id}`
}

export function decodeReviewCursor(value: string | undefined): Pick<TimelineRow, 'rank' | 'ref' | 'late' | 'round' | 'authorAt' | 'kindOrder' | 'id'> | null {
  const [rank, ref, late, round, iso, kindOrder, id] = (value ?? '').split('|')
  const authorAt = new Date(iso ?? '')
  const rankNumber = Number(rank)
  const roundNumber = Number(round)
  if (!id || !Number.isInteger(rankNumber) || (ref !== '0' && ref !== '1') || (late !== '0' && late !== '1') || (kindOrder !== '0' && kindOrder !== '1') || !Number.isInteger(roundNumber) || roundNumber < 0 || Number.isNaN(authorAt.getTime())) return null
  return { rank: rankNumber, ref: Number(ref), late: late === '1', round: roundNumber, authorAt, kindOrder: Number(kindOrder), id }
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
export async function listReviewQueue(options: { cursor?: string; now?: Date; userId?: string; kind?: ReviewItem['kind'] } = {}): Promise<ReviewQueue> {
  const now = options.now ?? new Date()
  const after = decodeReviewCursor(options.cursor)
  // Staff-pinned items first, then posts drawn from the reference library (staff, 2026-11-25), then the rest.
  const order = `ORDER BY rank, ref, late, round, "authorAt", "kindOrder", id`
  // `userId`: one account's own items only (its profile page).
  const conditions: string[] = []
  const params: unknown[] = []
  if (after) {
    conditions.push(`(rank, ref, late, round, "authorAt", "kindOrder", id) > ($1::bigint, $2::int, $3::boolean, $4::bigint, $5::timestamp, $6::int, $7::text)`)
    params.push(after.rank, after.ref, after.late, after.round, after.authorAt, after.kindOrder, after.id)
  }
  if (options.userId) {
    params.push(options.userId)
    conditions.push(`"userId" = $${params.length}::text`)
  }
  // `kind`: only accounts or only posts (the review page's two tabs).
  if (options.kind) {
    params.push(options.kind)
    conditions.push(`kind = $${params.length}::text`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = (await prisma.$queryRawUnsafe<TimelineRow[]>(`${TIMELINE_SQL} ${where} ${order} LIMIT ${REVIEW_ITEMS_PER_PAGE + 1}`, ...params))
    .map((row) => ({ ...row, rank: Number(row.rank), ref: Number(row.ref), round: Number(row.round), kindOrder: Number(row.kindOrder) }))
  const page = rows.slice(0, REVIEW_ITEMS_PER_PAGE)

  const profileIds = page.filter((row) => row.kind === 'profile').map((row) => row.id)
  const postIds = page.filter((row) => row.kind === 'post').map((row) => row.id)
  const [totalProfiles, totalPosts, users, posts] = await Promise.all([
    prisma.operatorAccount.count({ where: { OR: [{ reviewState: { not: 'approved' } }, { pendingImage: { not: null } }, { pendingDrawingAt: { not: null } }], user: { isOperator: true, isDeleted: false } } }),
    prisma.operatorPostReserve.count({ where: { state: { in: [...REVIEW_POST_STATES, 'scheduled'] }, operatorUser: { isDeleted: false } } }),
    prisma.user.findMany({
      where: { id: { in: profileIds } },
      select: {
        id: true, name: true, handle: true, image: true, bio: true, birthDate: true,
        locationCity: true, locationCountry: true, primaryLanguages: true, interestLanguages: true, interestLanguageLevels: true,
        operatorAccount: { select: { personaGender: true, reviewState: true, reviewFeedback: true, pendingImage: true, pendingDrawingAt: true } },
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
          candidate: user.operatorAccount?.reviewState === 'approved'
            ? { image: user.operatorAccount.pendingImage, drawing: candidateDrawing(user.operatorAccount.pendingDrawingAt, now) }
            : null,
        },
      })
    } else {
      const post = postsById.get(row.id)
      if (!post) continue
      const author = post.operatorUser
      items.push({
        kind: 'post', key, at, pinned: row.rank !== UNRANKED, fromReference: row.ref === 0,
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

/**
 * A live account's profile photo: 재제작 draws a new one for review (also how
 * the account page sends one), 게시 takes it, 삭제 passes on it. The account
 * and its current photo are never touched until staff take the new one.
 */
async function reviewAvatarCandidate(
  ctx: AdminContext | null,
  userId: string,
  action: ReviewAction,
  feedback: string | null,
  reference?: AvatarReference,
): Promise<ProfileReviewResult> {
  const account = await prisma.operatorAccount.findUnique({ where: { userId }, select: { pendingImage: true, pendingDrawingAt: true } })
  const drawing = candidateDrawing(account?.pendingDrawingAt)
  if (action === 'publish') {
    if (drawing) return { ok: false, error: 'busy' }
    const taken = await applyAvatarCandidate(ctx, userId)
    return taken.ok ? { ok: true, state: 'approved', image: taken.image } : { ok: false, error: 'already_approved' }
  }
  if (action === 'delete') {
    const discarded = await discardAvatarCandidate(ctx, userId)
    return discarded.ok ? { ok: true, state: 'deleted' } : { ok: false, error: 'already_approved' }
  }
  if (action !== 'regenerate') return { ok: false, error: 'already_approved' }
  if (drawing) return { ok: false, error: 'busy' }
  if (!canDrawImagesHere()) return { ok: false, error: 'regenerate_failed' }
  await prisma.operatorAccount.update({ where: { userId }, data: { pendingDrawingAt: new Date(), reviewFeedback: feedback } })
  runningHere.add(profileJob(userId))
  void (async () => {
    try {
      const drawn = await generateOperatorAvatar(ctx, userId, { feedback, reference, candidate: true })
      await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'candidate_regenerate', feedback, drawn: drawn.ok } })
    } catch (error) {
      console.warn('[operator-review] background_candidate_failed', { userId, error: error instanceof Error ? error.name : 'unknown' })
    } finally {
      await prisma.operatorAccount.updateMany({ where: { userId }, data: { pendingDrawingAt: null } }).catch(() => {})
      runningHere.delete(profileJob(userId))
    }
  })()
  return { ok: true, state: 'drawing' }
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
  options: { reference?: AvatarReference } = {},
): Promise<ProfileReviewResult> {
  const account = await prisma.operatorAccount.findUnique({
    where: { userId },
    select: { reviewState: true, user: { select: { isOperator: true, isDeleted: true } } },
  })
  if (!account || !account.user.isOperator || account.user.isDeleted) return { ok: false, error: 'not_found' }
  if (account.reviewState === 'approved') return reviewAvatarCandidate(ctx, userId, action, feedback, options.reference)

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

  if (account.reviewState === 'drawing' && !(await releaseProfileIfCutOff(userId))) return { ok: false, error: 'busy' }
  // 재제작 where this server can draw (the ChatGPT pool): the new photo is
  // drawn in the background (longer than the hosting proxy keeps a request
  // open) while the account shows as drawing; the card polls. Once drawn the
  // account is back in review; a failed drawing falls back to drawing by hand.
  if (canDrawImagesHere()) {
    runningHere.add(profileJob(userId))
    try {
      await prisma.operatorAccount.update({ where: { userId }, data: { reviewState: 'drawing', reviewFeedback: feedback } })
    } catch (error) {
      runningHere.delete(profileJob(userId))
      throw error
    }
    void (async () => {
      try {
        const drawn = await generateOperatorAvatar(ctx, userId, { feedback, reference: options.reference })
        if (drawn.ok) {
          await prisma.operatorAccount.updateMany({ where: { userId, reviewState: 'drawing' }, data: { reviewState: 'pending' } })
          await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'regenerate', feedback, drawing: false } })
          return
        }
        const plan = await planOperatorAvatar(userId, { feedback })
        await prisma.operatorAccount.updateMany({ where: { userId, reviewState: 'drawing' }, data: plan ? { avatarSpec: plan } : { reviewState: 'pending' } })
        await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'regenerate', feedback, drawing: Boolean(plan) } })
      } catch (error) {
        console.warn('[operator-review] background_avatar_failed', { userId, error: error instanceof Error ? error.name : 'unknown' })
        await prisma.operatorAccount.updateMany({ where: { userId, reviewState: 'drawing' }, data: { reviewState: 'pending' } }).catch(() => {})
      } finally {
        runningHere.delete(profileJob(userId))
      }
    })()
    return { ok: true, state: 'drawing' }
  }
  // 재제작: a new photo spec (with the feedback) waits to be drawn by hand in
  // ChatGPT (scripts/draw-pending-photos.mts); the current photo stays until then.
  const plan = await planOperatorAvatar(userId, { feedback })
  if (!plan) return { ok: false, error: 'regenerate_failed' }
  await prisma.operatorAccount.update({ where: { userId }, data: { reviewState: 'drawing', reviewFeedback: feedback, avatarSpec: plan } })
  await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'regenerate', feedback, drawing: true } })
  return { ok: true, state: 'drawing' }
}

export type PostReviewResult =
  | { ok: true; state: 'published' | 'deleted' | 'review'; postId?: string | null; post?: ReviewPost }
  | { ok: false; error: 'not_found' | 'profile_pending' | 'photo_pending' | 'busy' | 'publish_failed' | 'regenerate_failed' | 'draw_failed' }

/** 게시 / 삭제 / 재제작 for a post waiting for review. */
export async function reviewOperatorPost(
  ctx: AdminContext | null,
  reserveId: string,
  action: ReviewAction,
  feedback: string | null,
  now: Date = new Date(),
  options: { reference?: AvatarReference } = {},
): Promise<PostReviewResult> {
  const row = await prisma.operatorPostReserve.findUnique({
    where: { id: reserveId },
    select: { ...POST_SELECT, operatorUserId: true, operatorUser: { select: { isActive: true } } },
  })
  if (!row || !REVIEW_POST_STATES.includes(row.state)) return { ok: false, error: 'not_found' }
  // Busy only while a job is really running here; a row left `regenerating` by
  // a cut-off job is put back and answered.
  if (row.state === 'regenerating' && !(await releaseIfCutOff(reserveId))) return { ok: false, error: 'busy' }
  // Feedback on every answer is kept on the row and in the audit log, not only on 재제작.
  const audit = (decision: string, extra: Record<string, string | boolean | null> = {}) => writeAdminAudit(ctx, {
    action: 'operator_post.review', operatorUserId: row.operatorUserId, targetType: 'reserve', targetId: reserveId, metadata: { decision, feedback, ...extra },
  })

  if (action === 'publish') {
    // The author must be public before anything goes out in their name.
    if (!row.operatorUser.isActive) return { ok: false, error: 'profile_pending' }
    if (row.imagePrompt && !row.imageObjectKey) return { ok: false, error: 'photo_pending' }
    if (feedback) await prisma.operatorPostReserve.update({ where: { id: reserveId }, data: { reviewFeedback: feedback } })
    // Answered once claimed; the release finishes in the background (worker.ts).
    const result = await publishReservePostNow(reserveId, 'review', now, { background: true })
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

  if (action === 'redraw_photo') {
    // Only where this server draws (the pool): the old photo stays until the new one is in.
    if (!canDrawImagesHere()) return { ok: false, error: 'draw_failed' }
    if (!row.imagePrompt && !row.imageObjectKey) return { ok: false, error: 'not_found' }
    const brief = row.imagePrompt ?? '[self] A casual everyday photo of the poster that fits the post.'
    const description = feedback ? `${brief}\nStaff feedback on the previous photo, to follow: ${feedback}` : brief
    // The photo being replaced is never attached: fed back in redraw after redraw, photos
    // broke up and turned strange (staff 2026-11-24). The brief, the feedback and the post's text are enough.
    runningHere.add(postJob(reserveId))
    let claimed: { count: number }
    try {
      claimed = await prisma.operatorPostReserve.updateMany({
        where: { id: reserveId, state: 'review' },
        data: { state: 'regenerating', error: PHOTO_DRAWING, ...(feedback ? { reviewFeedback: feedback } : {}) },
      })
    } catch (error) {
      runningHere.delete(postJob(reserveId))
      throw error
    }
    if (claimed.count === 0) {
      runningHere.delete(postJob(reserveId))
      return { ok: false, error: 'busy' }
    }
    void drawPostPhotoInBackground(
      reserveId, row.operatorUserId, description,
      () => audit('redraw_photo', { photo: true }), () => audit('redraw_photo', { photo: false }),
      options.reference, { postText: row.text },
    )
    const drawing = await prisma.operatorPostReserve.findUnique({ where: { id: reserveId }, select: POST_SELECT })
    return { ok: true, state: 'review', post: toReviewPost(drawing ?? { ...row, state: 'regenerating', error: PHOTO_DRAWING }) }
  }

  if (action === 'draw') {
    if (!row.imagePrompt || row.imageObjectKey) return { ok: false, error: 'not_found' }
    if (canDrawImagesHere()) {
      // Drawn right here (the ChatGPT pool), the text untouched, in the
      // background: a photo of a person takes over two minutes, longer than
      // the hosting proxy keeps a request open. The card polls until it is in.
      runningHere.add(postJob(reserveId))
      let claimedDraw: { count: number }
      try {
        claimedDraw = await prisma.operatorPostReserve.updateMany({
          where: { id: reserveId, state: 'review' },
          data: { state: 'regenerating', error: PHOTO_DRAWING, ...(feedback ? { reviewFeedback: feedback } : {}) },
        })
      } catch (error) {
        runningHere.delete(postJob(reserveId))
        throw error
      }
      if (claimedDraw.count === 0) {
        runningHere.delete(postJob(reserveId))
        return { ok: false, error: 'busy' }
      }
      const description = feedback ? `${row.imagePrompt}\nStaff feedback on this photo, to follow: ${feedback}` : row.imagePrompt
      void drawPostPhotoInBackground(reserveId, row.operatorUserId, description, () => audit('draw', { photo: true }), () => audit('draw', { photo: false }), options.reference)
      const drawing = await prisma.operatorPostReserve.findUnique({ where: { id: reserveId }, select: POST_SELECT })
      return { ok: true, state: 'review', post: toReviewPost(drawing ?? { ...row, state: 'regenerating', error: PHOTO_DRAWING }) }
    }
    const updated = await prisma.operatorPostReserve.update({
      where: { id: reserveId },
      data: { error: PHOTO_REQUESTED, ...(feedback ? { reviewFeedback: feedback } : {}) },
      select: POST_SELECT,
    })
    await audit('draw')
    return { ok: true, state: 'review', post: toReviewPost(updated) }
  }

  runningHere.add(postJob(reserveId))
  let handedToDraw = false
  try {
    const claimed = await prisma.operatorPostReserve.updateMany({
      where: { id: reserveId, state: 'review' },
      data: { state: 'regenerating', error: TEXT_REWRITING, reviewFeedback: feedback },
    })
    if (claimed.count === 0) return { ok: false, error: 'busy' }
    const persona = await loadReservePersona(row.operatorUserId, now, { includeInactive: true })
    if (!persona) throw new Error('persona_unavailable')
    const [generated] = await generateReservePosts({
      persona,
      topics: [row.topic ?? pickReserveTopics(1, Math.random, reservePosterProfile(row.operatorUserId).topicFactors, { korea: !isKoreaCountry(persona.country) })[0]],
      existingTexts: await loadExistingReserveTexts(row.operatorUserId),
      seed: row.operatorUserId,
      revision: { previousText: row.text, feedback },
    })
    if (!generated) throw new Error('nothing_generated')
    // Drawn before it can go out, so staff judge the photo too. Where the pool
    // draws, the new text shows at once and the photo follows in the background
    // (the card polls); elsewhere it waits to be drawn by hand.
    const drawHere = Boolean(generated.imagePrompt) && canDrawImagesHere()
    const updated = await prisma.operatorPostReserve.update({
      where: { id: reserveId },
      data: {
        state: drawHere ? 'regenerating' : 'review',
        text: generated.text,
        topic: generated.topic,
        language: generated.language === persona.language ? null : generated.language,
        imagePrompt: generated.imagePrompt,
        imageObjectKey: null,
        imageWidth: null,
        imageHeight: null,
        error: drawHere ? PHOTO_DRAWING : generated.imagePrompt ? PHOTO_REQUESTED : null,
      },
      select: POST_SELECT,
    })
    if (drawHere) {
      handedToDraw = true
      void drawPostPhotoInBackground(reserveId, row.operatorUserId, generated.imagePrompt!, () => audit('regenerate', { photo: true }), () => audit('regenerate', { photo: false }), options.reference)
    } else {
      await audit('regenerate', { photo: generated.imagePrompt ? false : null })
    }
    return { ok: true, state: 'review', post: toReviewPost(updated) }
  } catch (error) {
    await prisma.operatorPostReserve.updateMany({
      where: { id: reserveId, state: 'regenerating' },
      data: { state: 'review', error: error instanceof Error ? error.message.slice(0, 300) : 'regenerate_failed' },
    })
    await audit('regenerate', { ok: false })
    return { ok: false, error: 'regenerate_failed' }
  } finally {
    if (!handedToDraw) runningHere.delete(postJob(reserveId))
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

/** Earliest time staff may date a post at. */
const EARLIEST_PUBLISH_AT = Date.parse('2024-01-01T00:00:00Z')

/**
 * Staff set the time a post in review is dated at when it is published
 * (`value` an ISO time, not in the future), or clear it (null: a random time
 * between writing and 게시). Kept in release_at, which a row in review
 * otherwise never holds.
 */
export async function setReviewPostPublishAt(
  ctx: AdminContext,
  id: string,
  value: unknown,
  now: Date = new Date(),
): Promise<{ ok: true; post: ReviewPost } | { ok: false; error: 'not_found' | 'invalid_time' }> {
  let at: Date | null = null
  if (value !== null) {
    if (typeof value !== 'string') return { ok: false, error: 'invalid_time' }
    at = new Date(value)
    const ms = at.getTime()
    if (Number.isNaN(ms) || ms < EARLIEST_PUBLISH_AT || ms > now.getTime() + 60_000) return { ok: false, error: 'invalid_time' }
    if (ms > now.getTime()) at = now
  }
  const row = await prisma.operatorPostReserve.findUnique({ where: { id }, select: { operatorUserId: true } })
  if (!row) return { ok: false, error: 'not_found' }
  const updated = await prisma.operatorPostReserve.updateMany({ where: { id, state: { in: REVIEW_POST_STATES } }, data: { releaseAt: at } })
  if (updated.count === 0) return { ok: false, error: 'not_found' }
  const saved = await prisma.operatorPostReserve.findUnique({ where: { id }, select: POST_SELECT })
  await writeAdminAudit(ctx, {
    action: 'operator_post.review',
    operatorUserId: row.operatorUserId,
    targetType: 'reserve',
    targetId: id,
    metadata: { decision: 'set_publish_at', publishAt: at?.toISOString() ?? null },
  })
  return saved ? { ok: true, post: toReviewPost(saved) } : { ok: false, error: 'not_found' }
}

/** Longest topic label staff may set. */
const MAX_TOPIC_LENGTH = 60

export type ReviewPostEdit = { text?: unknown; language?: unknown; topic?: unknown; publishAt?: unknown }

/**
 * Staff edit everything of a post in review but its photos, in one save:
 * text, the language it is written in, its topic and the time it is dated at
 * (see setReviewPostPublishAt). Fields left out stay as they are.
 */
export async function editReviewPost(
  ctx: AdminContext,
  id: string,
  edit: ReviewPostEdit,
  now: Date = new Date(),
): Promise<{ ok: true; post: ReviewPost } | { ok: false; error: 'not_found' | 'invalid_text' | 'invalid_language' | 'invalid_time' | 'busy' }> {
  const data: Prisma.OperatorPostReserveUpdateManyMutationInput = {}
  if (edit.text !== undefined) {
    const text = typeof edit.text === 'string' ? edit.text.trim() : ''
    if (!text || text.length > MAX_REVIEW_TEXT_LENGTH) return { ok: false, error: 'invalid_text' }
    data.text = text
  }
  if (edit.language !== undefined) {
    const language = edit.language === null || edit.language === '' ? null : canonicalizeSttLanguageCode(String(edit.language))
    if (edit.language && !language) return { ok: false, error: 'invalid_language' }
    data.language = language
  }
  if (edit.topic !== undefined) {
    const topic = typeof edit.topic === 'string' ? edit.topic.trim().slice(0, MAX_TOPIC_LENGTH) : ''
    data.topic = topic || null
  }
  if (edit.publishAt !== undefined) {
    if (edit.publishAt === null || edit.publishAt === '') data.releaseAt = null
    else {
      const at = typeof edit.publishAt === 'string' ? new Date(edit.publishAt) : null
      const ms = at?.getTime() ?? Number.NaN
      if (!at || Number.isNaN(ms) || ms < EARLIEST_PUBLISH_AT || ms > now.getTime() + 60_000) return { ok: false, error: 'invalid_time' }
      data.releaseAt = ms > now.getTime() ? now : at
    }
  }
  const row = await prisma.operatorPostReserve.findUnique({ where: { id }, select: { state: true, operatorUserId: true } })
  if (!row || !REVIEW_POST_STATES.includes(row.state)) return { ok: false, error: 'not_found' }
  // The text only while no rewrite runs; the rest also during a photo redraw.
  const updated = await prisma.operatorPostReserve.updateMany({ where: { id, state: data.text !== undefined ? 'review' : { in: REVIEW_POST_STATES } }, data })
  if (updated.count === 0) return { ok: false, error: 'busy' }
  const saved = await prisma.operatorPostReserve.findUnique({ where: { id }, select: POST_SELECT })
  await writeAdminAudit(ctx, {
    action: 'operator_post.review',
    operatorUserId: row.operatorUserId,
    targetType: 'reserve',
    targetId: id,
    metadata: { decision: 'edit', fields: Object.keys(data).join(','), length: typeof data.text === 'string' ? data.text.length : null },
  })
  return saved ? { ok: true, post: toReviewPost(saved) } : { ok: false, error: 'not_found' }
}

/** Longest post text staff may write in review (same cap as a published post). */
const MAX_REVIEW_TEXT_LENGTH = 1000

/**
 * Staff rewrote a post's text in review by hand. The photo and its plan stay;
 * translations made from the old text are left behind (they carry their
 * source text and are only reused for the same text).
 */
export async function setReviewPostText(
  ctx: AdminContext,
  id: string,
  text: unknown,
): Promise<{ ok: true; post: ReviewPost } | { ok: false; error: 'not_found' | 'invalid_text' | 'busy' }> {
  if (typeof text !== 'string') return { ok: false, error: 'invalid_text' }
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > MAX_REVIEW_TEXT_LENGTH) return { ok: false, error: 'invalid_text' }
  const row = await prisma.operatorPostReserve.findUnique({ where: { id }, select: { state: true, operatorUserId: true } })
  if (!row || !REVIEW_POST_STATES.includes(row.state)) return { ok: false, error: 'not_found' }
  const updated = await prisma.operatorPostReserve.updateMany({ where: { id, state: 'review' }, data: { text: trimmed } })
  if (updated.count === 0) return { ok: false, error: 'busy' }
  const saved = await prisma.operatorPostReserve.findUnique({ where: { id }, select: POST_SELECT })
  await writeAdminAudit(ctx, {
    action: 'operator_post.review',
    operatorUserId: row.operatorUserId,
    targetType: 'reserve',
    targetId: id,
    metadata: { decision: 'edit_text', length: trimmed.length },
  })
  return saved ? { ok: true, post: toReviewPost(saved) } : { ok: false, error: 'not_found' }
}

/**
 * A new text for a post in review, written by the model (Claude Opus 5.5,
 * never the ChatGPT pool) for the same person, language and photo,
 * with optional staff feedback. Nothing is saved: staff read it in the editor
 * and save it with setReviewPostText.
 */
export async function draftReviewPostText(
  id: string,
  feedback: unknown,
  now: Date = new Date(),
): Promise<{ ok: true; text: string } | { ok: false; error: 'not_found' | 'regenerate_failed' }> {
  const row = await prisma.operatorPostReserve.findUnique({
    where: { id },
    select: { state: true, text: true, topic: true, language: true, imagePrompt: true, operatorUserId: true },
  })
  if (!row || !REVIEW_POST_STATES.includes(row.state)) return { ok: false, error: 'not_found' }
  try {
    const persona = await loadReservePersona(row.operatorUserId, now, { includeInactive: true })
    if (!persona) return { ok: false, error: 'regenerate_failed' }
    const account = await prisma.user.findUnique({
      where: { id: row.operatorUserId },
      select: { primaryLanguages: true, interestLanguages: true, interestLanguageLevels: true, operatorAccount: { select: { personaGender: true } } },
    })
    const profile = {
      gender: account?.operatorAccount?.personaGender ?? null,
      age: persona.age,
      city: persona.city,
      country: persona.country,
      bio: persona.bio,
      speaks: account?.primaryLanguages ?? [persona.language],
      learning: account ? zipInterestLanguages(account.interestLanguages, account.interestLanguageLevels).map((item) => ({ language: item.code, level: item.level })) : [],
    }
    const photo = row.imagePrompt ? decodePostPhoto(row.imagePrompt) : null
    const text = await rewriteReservePostText({
      persona,
      previousText: row.text,
      language: row.language ?? persona.language,
      photo: photo ? { kind: photo.kind, description: photo.description } : null,
      feedback: normalizeReviewFeedback(feedback),
      existingTexts: await loadExistingReserveTexts(row.operatorUserId),
      seed: row.operatorUserId,
      topic: row.topic,
      profile,
    })
    return text ? { ok: true, text } : { ok: false, error: 'regenerate_failed' }
  } catch (error) {
    console.warn('[operator-review] draft_text_failed', { id, error: error instanceof Error ? error.message.slice(0, 60) : 'unknown' })
    return { ok: false, error: 'regenerate_failed' }
  }
}

export type ScheduleResult =
  | { ok: true; post: ReviewPost }
  | { ok: false; error: 'not_found' | 'busy' | 'profile_pending' | 'photo_pending' | 'invalid_time' }

/** A scheduled time must be at least a minute ahead and at most this far. */
export const SCHEDULE_LATEST_MS = 30 * 24 * 60 * 60_000

/**
 * 예약 게시: the post goes out by itself at `at` (the worker publishes it).
 * Without `at`, a time 2-30 hours ahead outside the persona's night. A
 * scheduled post takes a new time the same way.
 */
export async function scheduleReviewPost(ctx: AdminContext | null, id: string, at: Date | null, now: Date = new Date()): Promise<ScheduleResult> {
  const row = await prisma.operatorPostReserve.findUnique({
    where: { id },
    select: { state: true, imagePrompt: true, imageObjectKey: true, operatorUserId: true, operatorUser: { select: { isActive: true, operatorAccount: { select: { personaCountry: true } } } } },
  })
  if (!row) return { ok: false, error: 'not_found' }
  if (row.state === 'regenerating') return { ok: false, error: 'busy' }
  if (row.state !== 'review' && row.state !== 'scheduled') return { ok: false, error: 'not_found' }
  if (!row.operatorUser.isActive) return { ok: false, error: 'profile_pending' }
  if (row.imagePrompt && !row.imageObjectKey) return { ok: false, error: 'photo_pending' }
  const when = at ?? pickScheduledPublishAt({ now, personaCountry: row.operatorUser.operatorAccount?.personaCountry })
  if (Number.isNaN(when.getTime()) || when.getTime() < now.getTime() + 60_000 || when.getTime() > now.getTime() + SCHEDULE_LATEST_MS) return { ok: false, error: 'invalid_time' }
  const updated = await prisma.operatorPostReserve.updateMany({ where: { id, state: { in: ['review', 'scheduled'] } }, data: { state: 'scheduled', releaseAt: when, error: null } })
  if (updated.count === 0) return { ok: false, error: 'busy' }
  await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: row.operatorUserId, targetType: 'reserve', targetId: id, metadata: { decision: 'schedule', at: when.toISOString() } })
  const post = await getReviewPost(id)
  return post ? { ok: true, post } : { ok: false, error: 'not_found' }
}

/** 예약 취소: back to review, with no time set. */
export async function unscheduleReviewPost(ctx: AdminContext | null, id: string): Promise<ScheduleResult> {
  const row = await prisma.operatorPostReserve.findUnique({ where: { id }, select: { operatorUserId: true } })
  const updated = await prisma.operatorPostReserve.updateMany({ where: { id, state: 'scheduled' }, data: { state: 'review', releaseAt: null } })
  if (!row || updated.count === 0) return { ok: false, error: 'not_found' }
  await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: row.operatorUserId, targetType: 'reserve', targetId: id, metadata: { decision: 'unschedule' } })
  const post = await getReviewPost(id)
  return post ? { ok: true, post } : { ok: false, error: 'not_found' }
}
