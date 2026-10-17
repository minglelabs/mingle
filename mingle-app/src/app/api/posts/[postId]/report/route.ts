import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
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

type Ctx = { params: Promise<{ postId: string }> }

/**
 * Report a post. `reportedUserId` is filled with the post AUTHOR so the admin
 * console keeps one unified list. The reporter never learns anything about the
 * author beyond what the feed already showed, and the author is never notified.
 */
export async function POST(request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const reporterId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!reporterId) return json({ error: 'unauthorized' }, { status: 401 })

  const { postId: rawPostId } = await context.params
  const postId = rawPostId.trim()
  if (!postId) return json({ error: 'invalid_post_id' }, { status: 400 })

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

  // Only a post the reporter can actually see is reportable.
  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, reporterId),
    select: { id: true, authorId: true },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })
  if (post.authorId === reporterId) {
    return json({ error: 'cannot_report_own_content' }, { status: 400 })
  }

  const result = await createReport(prisma, {
    reporterId,
    reportedUserId: post.authorId,
    targetType: 'post',
    targetPostId: post.id,
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
