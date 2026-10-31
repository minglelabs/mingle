import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { storeReservePostImage } from '@/server/operator-post-reserve/post-image'
import { hidePostByModerator, unhidePostByModerator } from '@/server/reports/moderation-service'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import { resolveEditTargetLanguages, translatePostBodySettled } from '@/server/translation/post-translation-service'
import { operatorTextProvider } from '@/server/translation/translate-texts'

export const OPERATOR_POST_PHOTO_MAX_BYTES = 15 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_BODY_LENGTH = 1000

export type OperatorPostEditResult = { ok: true } | { ok: false; error: string; status: number }

/** The post, only when an operator account wrote it: staff never edit real users' posts. */
async function operatorPost(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, bodyVersion: true, sourceText: true, sourceLanguage: true, author: { select: { isOperator: true } } },
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
  const text = typeof rawText === 'string' ? rawText.trim() : ''
  if (!text || text.length > MAX_BODY_LENGTH) return { ok: false, error: 'invalid_text', status: 400 }
  if (text === post.sourceText) return { ok: true }

  const language = await detectSourceLanguage({ text, clientHint: post.sourceLanguage, provider: operatorTextProvider() })
  const prior = (await prisma.postTranslation.findMany({ where: { postId }, select: { language: true } })).map((row) => row.language)
  const targets = language ? resolveEditTargetLanguages(language, prior) : []
  const rows = language && targets.length ? await translatePostBodySettled({ sourceText: text, sourceLanguage: language, targetLanguages: targets, provider: operatorTextProvider() }) : []
  const bodyVersion = post.bodyVersion + 1

  const swapped = await prisma.$transaction(async (tx) => {
    const result = await tx.post.updateMany({ where: { id: postId, bodyVersion: post.bodyVersion }, data: { sourceText: text, sourceLanguage: language, bodyVersion } })
    if (result.count === 0) return false
    await tx.postTranslation.deleteMany({ where: { postId, bodyVersion } })
    if (rows.length) await tx.postTranslation.createMany({ data: rows.map((row) => ({ postId, bodyVersion, language: row.language, status: row.status, text: row.text })) })
    return true
  })
  if (!swapped) return { ok: false, error: 'conflict', status: 409 }
  await writeAdminAudit(ctx, { action: 'operator_post.edit_text', operatorUserId: post.authorId, targetType: 'post', targetId: post.id })
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
