import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { sendOperatorMessage } from '@/server/operator-inbox/send'
import { sqlUtcTimestamp } from '@/server/operator-posts/sql'
import { generateAutoReply, loadAutoReplyContext, resolveAutoReplyModel } from './generate'
import { getAutoReplySettings } from './settings'

/**
 * Answers for staff when they did not: a one-to-one room whose latest message
 * is from a real user and has waited longer than the staff-set delay gets one
 * AI-written reply as the room's operator account.
 *
 * - Only 1:1 rooms with an active operator account, only messages that
 *   arrived after auto-reply was turned on, and never ones older than a day.
 * - A staff reply (or any operator message) makes the room's latest message
 *   an operator's, so the room stops being a candidate; it is re-checked
 *   right before sending.
 * - The request id is derived from the answered message, so two runs (or two
 *   replicas) can never answer the same message twice.
 * - A message that fails 3 times in this process is left to staff.
 */
export const AUTO_REPLY_MAX_ROOMS_PER_RUN = 20
export const AUTO_REPLY_MAX_AGE_MS = 24 * 60 * 60_000
export const AUTO_REPLY_MAX_ATTEMPTS = 3
const MAX_TRACKED_MESSAGES = 2_000

/** Audit context of the worker: no admin session is involved. */
const WORKER_CONTEXT: AdminContext = { sessionId: null, ip: null, userAgent: 'operator-auto-reply' }

export type AutoReplyCandidate = {
  conversationId: string
  sessionKey: string
  operatorUserId: string
  messageId: string
  createdAt: Date
}

export type AutoReplyRunSummary = {
  enabled: boolean
  candidates: number
  sent: number
  declined: number
  skipped: number
  failed: number
}

const STATE_KEY = Symbol.for('mingle.operatorAutoReply.attempts.v1')

/** messageId -> attempts used (process-local; `done` once answered or given up). */
function attemptsByMessage(): Map<string, number> {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: Map<string, number> }
  holder[STATE_KEY] ??= new Map()
  return holder[STATE_KEY]
}

function recordAttempt(messageId: string, attempts: number): void {
  const map = attemptsByMessage()
  map.delete(messageId)
  map.set(messageId, attempts)
  while (map.size > MAX_TRACKED_MESSAGES) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

export function __resetAutoReplyAttemptsForTests(): void {
  attemptsByMessage().clear()
}

/** `auto-<messageId>`, restricted to the characters a reply request id allows. */
export function autoReplyRequestId(messageId: string): string {
  return `auto-${messageId.replace(/[^A-Za-z0-9-]/g, '')}`.slice(0, 64)
}

/** Rooms waiting on staff for at least `delayMinutes`, oldest message first. */
export async function findAutoReplyCandidates(args: {
  now: Date
  delayMinutes: number
  enabledAt: Date
  limit?: number
}): Promise<AutoReplyCandidate[]> {
  const cutoff = new Date(args.now.getTime() - args.delayMinutes * 60_000)
  const since = new Date(Math.max(args.enabledAt.getTime(), args.now.getTime() - AUTO_REPLY_MAX_AGE_MS))
  if (since.getTime() >= cutoff.getTime()) return []
  return prisma.$queryRaw<AutoReplyCandidate[]>(Prisma.sql`
    SELECT
      channel.id AS "conversationId",
      channel.session_key AS "sessionKey",
      member.user_id AS "operatorUserId",
      latest.id AS "messageId",
      latest.created_at AS "createdAt"
    FROM app.app_conversation_channel_members AS member
    JOIN app.app_users AS operator_user
      ON operator_user.id = member.user_id
      AND operator_user.is_operator = true
      AND operator_user.is_deleted = false
      AND operator_user.is_active = true
    JOIN app.app_conversation_channels AS channel
      ON channel.id = member.channel_id
      AND (channel.is_deleted = false OR channel.is_deleted IS NULL)
    JOIN LATERAL (
      SELECT message.id, message.user_id, message.created_at
      FROM app.app_messages AS message
      WHERE message.session_key = channel.session_key
        AND (message.is_deleted = false OR message.is_deleted IS NULL)
      ORDER BY message.created_at DESC
      LIMIT 1
    ) AS latest ON true
    JOIN app.app_users AS sender
      ON sender.id = latest.user_id
      AND sender.is_operator = false
    WHERE member.left_at IS NULL
      AND latest.created_at <= ${sqlUtcTimestamp(cutoff)}
      AND latest.created_at > ${sqlUtcTimestamp(since)}
      AND (
        SELECT COUNT(*) FROM app.app_conversation_channel_members AS other
        WHERE other.channel_id = channel.id AND other.left_at IS NULL
      ) = 2
    ORDER BY latest.created_at ASC
    LIMIT ${args.limit ?? AUTO_REPLY_MAX_ROOMS_PER_RUN}
  `)
}

async function latestMessageId(sessionKey: string): Promise<string | null> {
  const latest = await prisma.appMessage.findFirst({
    where: { sessionKey, OR: [{ isDeleted: false }, { isDeleted: null }] },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return latest?.id ?? null
}

type Outcome = 'sent' | 'declined' | 'skipped' | 'failed'

/** Answer one candidate. Never throws. */
export async function autoReplyToCandidate(candidate: AutoReplyCandidate, now: Date = new Date()): Promise<Outcome> {
  const used = attemptsByMessage().get(candidate.messageId) ?? 0
  if (used >= AUTO_REPLY_MAX_ATTEMPTS) return 'skipped'
  recordAttempt(candidate.messageId, used + 1)
  try {
    const context = await loadAutoReplyContext({
      operatorUserId: candidate.operatorUserId,
      sessionKey: candidate.sessionKey,
      now,
    })
    if (!context) {
      recordAttempt(candidate.messageId, AUTO_REPLY_MAX_ATTEMPTS)
      return 'skipped'
    }
    const model = resolveAutoReplyModel()
    const text = await generateAutoReply(context, { model })
    if (!text) {
      // The model left this one to staff; do not ask again.
      recordAttempt(candidate.messageId, AUTO_REPLY_MAX_ATTEMPTS)
      return 'declined'
    }
    // Staff (or the user) may have written while the model was thinking.
    if ((await latestMessageId(candidate.sessionKey)) !== candidate.messageId) return 'skipped'

    const result = await sendOperatorMessage(WORKER_CONTEXT, {
      operatorUserId: candidate.operatorUserId,
      conversationId: candidate.conversationId,
      text,
      clientRequestId: autoReplyRequestId(candidate.messageId),
    })
    recordAttempt(candidate.messageId, AUTO_REPLY_MAX_ATTEMPTS)
    if (result.duplicate) return 'skipped'
    await writeAdminAudit(WORKER_CONTEXT, {
      action: 'inbox.auto_reply',
      operatorUserId: candidate.operatorUserId,
      targetType: 'message',
      targetId: result.messageId,
      metadata: {
        conversationId: candidate.conversationId,
        answeredMessageId: candidate.messageId,
        waitedMs: now.getTime() - new Date(candidate.createdAt).getTime(),
        model,
      },
    })
    return 'sent'
  } catch (error) {
    // Never the message text: the code or error name only.
    console.warn('[operator-auto-reply] reply_failed', {
      conversationId: candidate.conversationId,
      attempt: used + 1,
      error: error instanceof Error ? (error as { code?: string }).code ?? error.name : 'unknown',
    })
    return 'failed'
  }
}

/** One worker run. Does nothing (one settings read) while auto-reply is off. */
export async function runOperatorAutoReplies(options: { now?: () => Date } = {}): Promise<AutoReplyRunSummary> {
  const now = options.now ?? (() => new Date())
  const settings = await getAutoReplySettings()
  const summary: AutoReplyRunSummary = { enabled: settings.enabled, candidates: 0, sent: 0, declined: 0, skipped: 0, failed: 0 }
  if (!settings.enabled || !settings.enabledAt) return summary

  const candidates = await findAutoReplyCandidates({
    now: now(),
    delayMinutes: settings.delayMinutes,
    enabledAt: new Date(settings.enabledAt),
  })
  summary.candidates = candidates.length
  // One at a time: an operator in several rooms keeps a steady pace, and the model is not flooded.
  for (const candidate of candidates) {
    summary[await autoReplyToCandidate(candidate, now())] += 1
  }
  return summary
}
