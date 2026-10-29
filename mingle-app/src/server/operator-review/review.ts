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

export const REVIEW_OPERATORS_PER_PAGE = 5
export const REVIEW_POSTS_PER_OPERATOR = 6
export const REVIEW_POSTS_PER_PAGE = 30
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

export type ReviewOperator = {
  userId: string
  name: string | null
  handle: string
  image: string | null
  bio: string | null
  age: number | null
  city: string | null
  country: string | null
  primaryLanguages: string[]
  personaCountry: string | null
  personaGender: string | null
  profileState: string
  profileFeedback: string | null
  postsInReview: number
  posts: ReviewPost[]
}

export type ReviewQueue = {
  operators: ReviewOperator[]
  totalOperators: number
  totalPosts: number
  page: number
  pageCount: number
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

/** Operators with a profile or posts waiting for review, newest work last. */
export async function listReviewQueue(options: { page?: number; operatorUserId?: string; now?: Date } = {}): Promise<ReviewQueue> {
  const now = options.now ?? new Date()
  const operatorFilter = {
    isOperator: true,
    isDeleted: false,
    OR: [
      { operatorAccount: { reviewState: { not: 'approved' } } },
      { operatorPostReserve: { some: { state: { in: REVIEW_POST_STATES } } } },
    ],
  }
  const where = options.operatorUserId ? { ...operatorFilter, id: options.operatorUserId } : operatorFilter
  const [totalOperators, totalPosts] = await Promise.all([
    prisma.user.count({ where }),
    prisma.operatorPostReserve.count({
      where: { state: { in: REVIEW_POST_STATES }, ...(options.operatorUserId ? { operatorUserId: options.operatorUserId } : {}) },
    }),
  ])
  const pageCount = Math.max(1, Math.ceil(totalOperators / REVIEW_OPERATORS_PER_PAGE))
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount)
  const postsPerOperator = options.operatorUserId ? REVIEW_POSTS_PER_PAGE : REVIEW_POSTS_PER_OPERATOR

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * REVIEW_OPERATORS_PER_PAGE,
    take: REVIEW_OPERATORS_PER_PAGE,
    select: {
      id: true, name: true, handle: true, image: true, bio: true, birthDate: true,
      locationCity: true, locationCountry: true, primaryLanguages: true,
      operatorAccount: { select: { personaCountry: true, personaGender: true, reviewState: true, reviewFeedback: true } },
      operatorPostReserve: {
        where: { state: { in: REVIEW_POST_STATES } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: postsPerOperator,
        select: POST_SELECT,
      },
      _count: { select: { operatorPostReserve: { where: { state: { in: REVIEW_POST_STATES } } } } },
    },
  })

  return {
    operators: users.map((user) => ({
      userId: user.id,
      name: user.name,
      handle: user.handle,
      image: user.image,
      bio: user.bio,
      age: ageOn(user.birthDate, now),
      city: user.locationCity,
      country: user.locationCountry,
      primaryLanguages: user.primaryLanguages,
      personaCountry: user.operatorAccount?.personaCountry ?? null,
      personaGender: user.operatorAccount?.personaGender ?? null,
      profileState: user.operatorAccount?.reviewState ?? 'approved',
      profileFeedback: user.operatorAccount?.reviewFeedback ?? null,
      postsInReview: user._count.operatorPostReserve,
      posts: user.operatorPostReserve.map(toReviewPost),
    })),
    totalOperators,
    totalPosts,
    page,
    pageCount,
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
      prisma.operatorAccount.update({ where: { userId }, data: { reviewState: 'approved' } }),
      prisma.user.update({ where: { id: userId }, data: { isActive: true } }),
    ])
    await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'publish' } })
    return { ok: true, state: 'approved' }
  }

  if (action === 'delete') {
    // Never public, so nothing else refers to it; its reserve rows go with it.
    await prisma.user.delete({ where: { id: userId } })
    await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'delete' } })
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
  const audit = (decision: string, extra: Record<string, string | boolean | null> = {}) => writeAdminAudit(ctx, {
    action: 'operator_post.review', operatorUserId: row.operatorUserId, targetType: 'reserve', targetId: reserveId, metadata: { decision, ...extra },
  })

  if (action === 'publish') {
    // The author must be public before anything goes out in their name.
    if (!row.operatorUser.isActive) return { ok: false, error: 'profile_pending' }
    const result = await publishReservePostNow(reserveId, 'review', now)
    if (!result.ok) return { ok: false, error: result.error === 'reserve_empty' ? 'not_found' : 'publish_failed' }
    await audit('publish', { postId: result.postId })
    return { ok: true, state: 'published', postId: result.postId }
  }

  if (action === 'delete') {
    const cancelled = await prisma.operatorPostReserve.updateMany({ where: { id: reserveId, state: 'review' }, data: { state: 'cancelled', releaseAt: null } })
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
