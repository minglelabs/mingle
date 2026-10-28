import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { storeReservePostImage } from '@/server/operator-post-reserve/post-image'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import { resolveEditTargetLanguages, translatePostBodySettled } from '@/server/translation/post-translation-service'

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

  const language = await detectSourceLanguage({ text, clientHint: post.sourceLanguage })
  const prior = (await prisma.postTranslation.findMany({ where: { postId }, select: { language: true } })).map((row) => row.language)
  const targets = language ? resolveEditTargetLanguages(language, prior) : []
  const rows = language && targets.length ? await translatePostBodySettled({ sourceText: text, sourceLanguage: language, targetLanguages: targets }) : []
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
