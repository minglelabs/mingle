import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { storeReservePostImage } from '@/server/operator-post-reserve/post-image'
import { hidePostByModerator, unhidePostByModerator } from '@/server/reports/moderation-service'
import { detectSourceLanguageVerdict } from '@/server/translation/detect-source-language'
import { resolveEditTargetLanguages, translatePostBodySettled } from '@/server/translation/post-translation-service'
import { operatorTextProvider } from '@/server/translation/translate-texts'
import { convertToPersonaLanguage } from '@/server/operator-posts/convert'

const baseLanguage = (tag: string | null | undefined) => (tag ?? '').toLowerCase().split(/[-_]/)[0]

/**
 * Staff write edits in Korean; an account whose post was in its own language
 * (Indonesian, Japanese …) keeps posting in it, so Korean typed by staff is
 * converted into that language before it is saved, the way staff-written
 * posts are (operator-posts/convert.ts; staff, 2026-11-25). A post the persona
 * wrote in Korean on purpose (a learner's post) stays Korean. Null when
 * nothing needs converting or the conversion failed (the typed text is kept).
 */
async function intoPersonaLanguage(text: string, typed: string | null, post: { authorId: string; sourceLanguage: string | null; author: { primaryLanguages: string[] } }): Promise<{ text: string; language: string } | null> {
  const persona = post.author.primaryLanguages?.[0] ?? null
  if (!persona || baseLanguage(typed) !== 'ko' || baseLanguage(persona) === 'ko' || baseLanguage(post.sourceLanguage) === 'ko') return null
  try {
    const converted = await convertToPersonaLanguage({ operatorUserId: post.authorId, text })
    return converted.converted && converted.text.trim() ? { text: converted.text.trim(), language: converted.language } : null
  } catch {
    return null
  }
}

export const OPERATOR_POST_PHOTO_MAX_BYTES = 15 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_BODY_LENGTH = 1000

export type OperatorPostEditResult = { ok: true } | { ok: false; error: string; status: number }

/** The post, only when an operator account wrote it: staff never edit real users' posts. */
async function operatorPost(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, bodyVersion: true, sourceText: true, sourceLanguage: true, author: { select: { isOperator: true, primaryLanguages: true } } },
  })
  return post?.author.isOperator ? post : null
}

/** Replaces an operator post's main photo with an uploaded one (jpeg / png / webp). */
export async function replaceOperatorPostPhoto(ctx: AdminContext, postId: string, file: FormDataEntryValue | null): Promise<OperatorPostEditResult> {
  const post = await operatorPost(postId)
  if (!post) return { ok: false, error: 'not_found', status: 404 }
  if (!(file instanceof File) || !(PHOTO_TYPES as readonly string[]).includes(file.type) || file.size <= 0 || file.size > OPERATOR_POST_PHOTO_MAX_BYTES) {
    return { ok: false, error: 'invalid_image', status: 400 }
  }
  let image: Awaited<ReturnType<typeof storeReservePostImage>>
  try {
    image = await storeReservePostImage(post.authorId, Buffer.from(await file.arrayBuffer()))
  } catch {
    return { ok: false, error: 'invalid_image', status: 400 }
  }
  await prisma.post.update({ where: { id: post.id }, data: { imageObjectKey: image.objectKey, imageWidth: image.width, imageHeight: image.height } })
  await writeAdminAudit(ctx, { action: 'operator_post.edit_photo', operatorUserId: post.authorId, targetType: 'post', targetId: post.id })
  return { ok: true }
}

/**
 * Replaces an operator post's text as the app's own edit does: a new body
 * version whose translations are settled before the swap, so readers never
 * see the new text with the old translations.
 */
export async function editOperatorPostText(ctx: AdminContext, postId: string, rawText: unknown): Promise<OperatorPostEditResult> {
  const post = await operatorPost(postId)
  if (!post) return { ok: false, error: 'not_found', status: 404 }
  const typed = typeof rawText === 'string' ? rawText.trim() : ''
  if (!typed || typed.length > MAX_BODY_LENGTH) return { ok: false, error: 'invalid_text', status: 400 }
  if (typed === post.sourceText) return { ok: true }

  const typedVerdict = await detectSourceLanguageVerdict({ text: typed, clientHint: post.sourceLanguage, provider: operatorTextProvider() })
  // Korean typed by staff goes out in the persona's own language.
  const persona = typedVerdict.mixed ? null : await intoPersonaLanguage(typed, typedVerdict.language, post)
  const text = persona && persona.text.length <= MAX_BODY_LENGTH ? persona.text : typed
  const verdict = text === typed ? typedVerdict : { language: persona!.language, mixed: false }
  const language = verdict.language
  const mixed = Boolean(language) && verdict.mixed
  const prior = (await prisma.postTranslation.findMany({ where: { postId }, select: { language: true } })).map((row) => row.language)
  const targets = language ? resolveEditTargetLanguages(language, prior, null, mixed) : []
  const rows = language && targets.length ? await translatePostBodySettled({ sourceText: text, sourceLanguage: language, targetLanguages: targets, provider: operatorTextProvider(), sourceLanguagesMixed: mixed }) : []
  const bodyVersion = post.bodyVersion + 1

  const swapped = await prisma.$transaction(async (tx) => {
    const result = await tx.post.updateMany({ where: { id: postId, bodyVersion: post.bodyVersion }, data: { sourceText: text, sourceLanguage: language, sourceLanguagesMixed: mixed, bodyVersion } })
    if (result.count === 0) return false
    await tx.postTranslation.deleteMany({ where: { postId, bodyVersion } })
    if (rows.length) await tx.postTranslation.createMany({ data: rows.map((row) => ({ postId, bodyVersion, language: row.language, status: row.status, text: row.text })) })
    return true
  })
  if (!swapped) return { ok: false, error: 'conflict', status: 409 }
  await writeAdminAudit(ctx, { action: 'operator_post.edit_text', operatorUserId: post.authorId, targetType: 'post', targetId: post.id })
  return { ok: true }
}

/** No operator post is dated before the app existed. */
const EARLIEST_POST_AT = new Date('2024-01-01T00:00:00Z')

/**
 * Moves a published operator post to another time (staff 2026-11-24: two
 * posts published together showed the same minute). The time is in the past,
 * since a future one would hide the post until then; the feed and the profile
 * order by it.
 */
export async function editOperatorPostTime(ctx: AdminContext, postId: string, rawAt: unknown, now: Date = new Date()): Promise<OperatorPostEditResult> {
  const post = await operatorPost(postId)
  if (!post) return { ok: false, error: 'not_found', status: 404 }
  const at = typeof rawAt === 'string' ? new Date(rawAt) : new Date(Number.NaN)
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() || at < EARLIEST_POST_AT) return { ok: false, error: 'invalid_time', status: 400 }
  await prisma.post.update({ where: { id: postId }, data: { publishedAt: at, createdAt: at } })
  await writeAdminAudit(ctx, { action: 'operator_post.edit_time', operatorUserId: post.authorId, targetType: 'post', targetId: post.id, metadata: { at: at.toISOString() } })
  return { ok: true }
}

/**
 * Any other post (a staff test post, or a real user's): hidden from everyone
 * the way a report would hide it, or shown again. Nothing goes to the review
 * queue, which holds operator posts only.
 */
async function setPostHiddenByStaff(ctx: AdminContext, postId: string, hidden: boolean): Promise<OperatorPostEditResult> {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true } })
  if (!post) return { ok: false, error: 'not_found', status: 404 }
  if (hidden) await hidePostByModerator(prisma, post.id)
  else await unhidePostByModerator(prisma, post.id)
  await writeAdminAudit(ctx, { action: hidden ? 'post.takedown' : 'post.restore', targetType: 'post', targetId: post.id, metadata: { authorId: post.authorId } })
  return { ok: true }
}

/**
 * Takes an operator's published post down: hidden by staff, it leaves every
 * feed, profile and search (the starter feed too), and its text and photos go
 * back to the front of the review queue as a latent post (`postId` points at
 * the post it came from) to be fixed and published again as a new post.
 * Putting it back up restores the post and drops that latent copy if it is
 * still in review.
 */
export async function setOperatorPostHidden(ctx: AdminContext, postId: string, hidden: boolean): Promise<OperatorPostEditResult & { reserveId?: string }> {
  const post = await operatorPost(postId)
  if (!post) return setPostHiddenByStaff(ctx, postId, hidden)
  let reserveId: string | undefined
  if (hidden) {
    const [full, origin, low] = await Promise.all([
      prisma.post.findUnique({
        where: { id: post.id },
        select: {
          sourceText: true, sourceLanguage: true, imageObjectKey: true, imageWidth: true, imageHeight: true, moderationHiddenAt: true,
          extraImages: { orderBy: { position: 'asc' }, select: { imageObjectKey: true, imageWidth: true, imageHeight: true } },
        },
      }),
      prisma.operatorPostReserve.findFirst({ where: { postId: post.id, state: 'published' }, select: { topic: true, imagePrompt: true } }),
      prisma.$queryRaw<Array<{ low: number | null }>>`
        SELECT LEAST(
          (SELECT MIN(review_rank) FROM app.app_operator_accounts),
          (SELECT MIN(review_rank) FROM app.app_operator_post_reserve)
        ) AS low`,
    ])
    if (!full) return { ok: false, error: 'not_found', status: 404 }
    if (full.moderationHiddenAt) return { ok: true }
    const extraImages = full.imageObjectKey
      ? full.extraImages.map((image) => ({ objectKey: image.imageObjectKey, width: image.imageWidth, height: image.imageHeight }))
      : []
    const [, reserve] = await prisma.$transaction([
      prisma.post.update({ where: { id: post.id }, data: { moderationHiddenAt: new Date() } }),
      prisma.operatorPostReserve.create({
        data: {
          operatorUserId: post.authorId,
          text: full.sourceText ?? '',
          language: full.sourceLanguage,
          topic: origin?.topic ?? null,
          imagePrompt: origin?.imagePrompt ?? null,
          imageObjectKey: full.imageObjectKey,
          imageWidth: full.imageWidth,
          imageHeight: full.imageHeight,
          extraImages: extraImages.length ? extraImages : undefined,
          state: 'review',
          postId: post.id,
          reviewRank: (low[0]?.low ?? 1) - 1,
          reviewFeedback: '앱에서 내린 글',
        },
        select: { id: true },
      }),
    ])
    reserveId = reserve.id
  } else {
    await prisma.$transaction([
      prisma.post.update({ where: { id: post.id }, data: { moderationHiddenAt: null } }),
      prisma.operatorPostReserve.updateMany({ where: { postId: post.id, state: 'review' }, data: { state: 'cancelled', releaseAt: null } }),
    ])
  }
  await writeAdminAudit(ctx, {
    action: hidden ? 'operator_post.takedown' : 'operator_post.restore',
    operatorUserId: post.authorId,
    targetType: 'post',
    targetId: post.id,
    ...(reserveId ? { metadata: { reserveId } } : {}),
  })
  return { ok: true, ...(reserveId ? { reserveId } : {}) }
}

/**
 * Deletes an operator's published post for good (staff, 2026-11-24), the way
 * its author deletes it from the app (`isDeleted` + `deletedAt`): gone from
 * every feed, profile and search. A copy of it still waiting in review (from
 * an earlier 내리고 검토로) is cancelled too, so it never comes back.
 */
export async function deleteOperatorPost(ctx: AdminContext, postId: string): Promise<OperatorPostEditResult> {
  const post = await operatorPost(postId)
  if (!post) return { ok: false, error: 'not_found', status: 404 }
  const [, cancelled] = await prisma.$transaction([
    prisma.post.update({ where: { id: post.id }, data: { isDeleted: true, deletedAt: new Date() } }),
    prisma.operatorPostReserve.updateMany({ where: { postId: post.id, state: 'review' }, data: { state: 'cancelled', releaseAt: null } }),
  ])
  await writeAdminAudit(ctx, {
    action: 'operator_post.delete',
    operatorUserId: post.authorId,
    targetType: 'post',
    targetId: post.id,
    metadata: { cancelledReviewCopies: cancelled.count },
  })
  return { ok: true }
}
