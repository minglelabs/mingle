/**
 * Prisma implementations of PostTranslationRepository and
 * CommentTranslationRepository interfaces defined in
 * post-translation-service.ts.
 */

import { prisma } from '@/lib/prisma'
import type {
  PostTranslationRepository,
  PostTranslationRecord,
  CommentTranslationRepository,
  CommentTranslationRecord,
  PostTranslationStatus,
} from '@/server/translation/post-translation-service'

// ─── Post translation ────────────────────────────────────────────────────────

function toPostRecord(row: {
  postId: string
  bodyVersion: number
  language: string
  status: string
  text: string | null
}): PostTranslationRecord {
  return {
    postId: row.postId,
    bodyVersion: row.bodyVersion,
    language: row.language,
    status: row.status as PostTranslationStatus,
    text: row.text,
  }
}

export const prismaPostTranslationRepo: PostTranslationRepository = {
  async upsert(args) {
    const row = await prisma.postTranslation.upsert({
      where: {
        postId_bodyVersion_language: {
          postId: args.postId,
          bodyVersion: args.bodyVersion,
          language: args.language,
        },
      },
      create: {
        postId: args.postId,
        bodyVersion: args.bodyVersion,
        language: args.language,
        status: args.status,
        text: args.text,
      },
      update: {
        status: args.status,
        text: args.text,
      },
    })
    return toPostRecord(row)
  },

  async findByPost(postId) {
    const rows = await prisma.postTranslation.findMany({ where: { postId } })
    return rows.map(toPostRecord)
  },

  async find(postId, bodyVersion, language) {
    const row = await prisma.postTranslation.findUnique({
      where: { postId_bodyVersion_language: { postId, bodyVersion, language } },
    })
    return row ? toPostRecord(row) : null
  },

  async findByPostVersion(postId, bodyVersion) {
    const rows = await prisma.postTranslation.findMany({
      where: { postId, bodyVersion },
    })
    return rows.map(toPostRecord)
  },

  async replaceVersionTranslations({ postId, bodyVersion, rows }) {
    await prisma.$transaction([
      prisma.postTranslation.deleteMany({ where: { postId, bodyVersion } }),
      ...(rows.length > 0
        ? [
            prisma.postTranslation.createMany({
              data: rows.map((r) => ({
                postId,
                bodyVersion,
                language: r.language,
                status: r.status,
                text: r.text,
              })),
            }),
          ]
        : []),
    ])
  },
}

// ─── Comment translation ─────────────────────────────────────────────────────

function toCommentRecord(row: {
  commentId: string
  bodyVersion: number
  language: string
  status: string
  text: string | null
}): CommentTranslationRecord {
  return {
    commentId: row.commentId,
    bodyVersion: row.bodyVersion,
    language: row.language,
    status: row.status as PostTranslationStatus,
    text: row.text,
  }
}

export const prismaCommentTranslationRepo: CommentTranslationRepository = {
  async upsert(args) {
    const row = await prisma.postCommentTranslation.upsert({
      where: {
        commentId_bodyVersion_language: {
          commentId: args.commentId,
          bodyVersion: args.bodyVersion,
          language: args.language,
        },
      },
      create: {
        commentId: args.commentId,
        bodyVersion: args.bodyVersion,
        language: args.language,
        status: args.status,
        text: args.text,
      },
      update: {
        status: args.status,
        text: args.text,
      },
    })
    return toCommentRecord(row)
  },

  async find(commentId, bodyVersion, language) {
    const row = await prisma.postCommentTranslation.findUnique({
      where: { commentId_bodyVersion_language: { commentId, bodyVersion, language } },
    })
    return row ? toCommentRecord(row) : null
  },

  async findByCommentVersion(commentId, bodyVersion) {
    const rows = await prisma.postCommentTranslation.findMany({
      where: { commentId, bodyVersion },
    })
    return rows.map(toCommentRecord)
  },

  async findByComment(commentId) {
    const rows = await prisma.postCommentTranslation.findMany({ where: { commentId } })
    return rows.map(toCommentRecord)
  },

  async replaceVersionTranslations({ commentId, bodyVersion, rows }) {
    await prisma.$transaction([
      prisma.postCommentTranslation.deleteMany({ where: { commentId, bodyVersion } }),
      ...(rows.length > 0
        ? [
            prisma.postCommentTranslation.createMany({
              data: rows.map((r) => ({
                commentId,
                bodyVersion,
                language: r.language,
                status: r.status,
                text: r.text,
              })),
            }),
          ]
        : []),
    ])
  },
}

// ─── Convenience: wired deps object ─────────────────────────────────────────

export const prismaTranslationDeps = {
  postTranslationRepo: prismaPostTranslationRepo,
  commentTranslationRepo: prismaCommentTranslationRepo,
} as const
