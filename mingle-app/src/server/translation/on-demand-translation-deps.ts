/**
 * Translation deps for the ON-DEMAND translate routes: the Prisma
 * repositories plus conditional writes (`upsertUnlessReady`), so a request's
 * `pending` claim or `failed` mark never overwrites a `ready` row that
 * another request finished in the meantime (e.g. just after the in-process
 * in-flight entry was removed, or on another instance).
 *
 * Each write is createMany(skipDuplicates) — insert when absent — followed by
 * updateMany guarded by `status != 'ready'`, then a read of the row as it
 * now stands. Both statements are single-row atomic in Postgres, so no
 * interleaving can turn a ready row back into pending/failed.
 */

import { prisma } from '@/lib/prisma'
import { prismaTranslationDeps } from '@/server/posts/post-translation-repository'
import type {
  CommentTranslationRepository,
  PostTranslationRepository,
  PostTranslationServiceDeps,
  PostTranslationStatus,
} from './post-translation-service'

const postRepo: PostTranslationRepository = {
  ...prismaTranslationDeps.postTranslationRepo,
  async upsertUnlessReady({ postId, bodyVersion, language, status, text }) {
    await prisma.postTranslation.createMany({
      data: [{ postId, bodyVersion, language, status, text }],
      skipDuplicates: true,
    })
    await prisma.postTranslation.updateMany({
      where: { postId, bodyVersion, language, status: { not: 'ready' } },
      data: { status, text },
    })
    const row = await prisma.postTranslation.findUnique({
      where: { postId_bodyVersion_language: { postId, bodyVersion, language } },
    })
    return row
      ? { postId, bodyVersion, language, status: row.status as PostTranslationStatus, text: row.text }
      : { postId, bodyVersion, language, status, text }
  },
}

const commentRepo: CommentTranslationRepository = {
  ...prismaTranslationDeps.commentTranslationRepo,
  async upsertUnlessReady({ commentId, bodyVersion, language, status, text }) {
    await prisma.postCommentTranslation.createMany({
      data: [{ commentId, bodyVersion, language, status, text }],
      skipDuplicates: true,
    })
    await prisma.postCommentTranslation.updateMany({
      where: { commentId, bodyVersion, language, status: { not: 'ready' } },
      data: { status, text },
    })
    const row = await prisma.postCommentTranslation.findUnique({
      where: { commentId_bodyVersion_language: { commentId, bodyVersion, language } },
    })
    return row
      ? { commentId, bodyVersion, language, status: row.status as PostTranslationStatus, text: row.text }
      : { commentId, bodyVersion, language, status, text }
  },
}

export const onDemandTranslationDeps: PostTranslationServiceDeps = {
  postTranslationRepo: postRepo,
  commentTranslationRepo: commentRepo,
}
