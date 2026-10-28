import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSingleCommentWhere } from '@/server/posts/comment-visibility'
import {
  createReport,
  normalizeReportMessage,
  normalizeReportReason,
} from '@/server/reports/report-service'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type Ctx = { params: Promise<{ commentId: string }> }

/**
 * Report a comment. `reportedUserId` is the comment AUTHOR, keeping the admin
 * console's single list intact. A soft-deleted comment can no longer be
 * reported (it is not visible content anymore).
 */
export async function POST(request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const reporterId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!reporterId) return json({ error: 'unauthorized' }, { status: 401 })

  const { commentId: rawCommentId } = await context.params
  const commentId = rawCommentId.trim()
  if (!commentId) return json({ error: 'invalid_comment_id' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })
  const { reason: rawReason, message: rawMessage } = body as Record<string, unknown>

  const reason = normalizeReportReason(rawReason)
  if (!reason) return json({ error: 'invalid_reason' }, { status: 400 })

  const messageResult = normalizeReportMessage(rawMessage)
  if (!messageResult.ok) return json({ error: 'invalid_message' }, { status: 400 })

  const comment = await prisma.postComment.findFirst({
    where: {
      ...visibleSingleCommentWhere(commentId, reporterId),
      OR: [{ isDeleted: null }, { isDeleted: false }],
    },
    select: { id: true, authorId: true },
  })
  if (!comment) return json({ error: 'not_found' }, { status: 404 })
  if (comment.authorId === reporterId) {
    return json({ error: 'cannot_report_own_content' }, { status: 400 })
  }

  const result = await createReport(prisma, {
    reporterId,
    reportedUserId: comment.authorId,
    targetType: 'comment',
    targetCommentId: comment.id,
    reason,
    message: messageResult.message,
  })

  if (result.status === 'duplicate') {
    return json({ status: 'already_reported', duplicate: true }, { status: 200 })
  }
  return json(
    { reportId: result.reportId, status: result.reportStatus },
    { status: 201 },
  )
}
