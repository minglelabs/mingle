import { prisma } from '@/lib/prisma'
import { writeAdminAudit } from '@/server/admin/audit'

export type AppPostImage = { objectKey: string; width: number | null; height: number | null }

/** A resend of the same post within this window reuses the queued copy. */
const RESEND_WINDOW_MS = 10 * 60 * 1000

export const APP_POST_REVIEW_FEEDBACK = '앱에서 쓴 글 (검수 후 게시)'

/**
 * A post written in the app by an operator account: instead of going live it
 * becomes a latent post at the front of the admin review queue, and only the
 * review release publishes it. Returns null for any other account, whose post
 * is published as usual.
 */
export async function queueOperatorAppPostForReview(input: {
  authorId: string
  text: string | null
  images: AppPostImage[]
}): Promise<{ reserveId: string } | null> {
  const author = await prisma.user.findUnique({ where: { id: input.authorId }, select: { isOperator: true } })
  if (!author?.isOperator) return null

  const text = input.text ?? ''
  const [first, ...extra] = input.images
  const recent = await prisma.operatorPostReserve.findFirst({
    where: {
      operatorUserId: input.authorId,
      state: 'review',
      text,
      imageObjectKey: first?.objectKey ?? null,
      createdAt: { gte: new Date(Date.now() - RESEND_WINDOW_MS) },
    },
    select: { id: true },
  })
  if (recent) return { reserveId: recent.id }

  const low = await prisma.$queryRaw<Array<{ low: number | null }>>`
    SELECT LEAST(
      (SELECT MIN(review_rank) FROM app.app_operator_accounts),
      (SELECT MIN(review_rank) FROM app.app_operator_post_reserve)
    ) AS low`
  const reserve = await prisma.operatorPostReserve.create({
    data: {
      operatorUserId: input.authorId,
      text,
      imageObjectKey: first?.objectKey ?? null,
      imageWidth: first?.width ?? null,
      imageHeight: first?.height ?? null,
      extraImages: first && extra.length ? extra : undefined,
      state: 'review',
      reviewRank: (low[0]?.low ?? 1) - 1,
      reviewFeedback: APP_POST_REVIEW_FEEDBACK,
    },
    select: { id: true },
  })
  await writeAdminAudit(null, {
    action: 'operator_post.app_post_queued',
    operatorUserId: input.authorId,
    targetType: 'operator_post_reserve',
    targetId: reserve.id,
  })
  return { reserveId: reserve.id }
}
