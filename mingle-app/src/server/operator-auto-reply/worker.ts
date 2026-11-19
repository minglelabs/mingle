import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { sendOperatorMessage } from '@/server/operator-inbox/send'
import { seededRandom } from '@/server/operator-avatars/taxonomy'
import { sqlUtcTimestamp } from '@/server/operator-posts/sql'
import { generateAutoReply, loadAutoReplyContext, resolveAutoReplyModel } from './generate'
import { getAutoReplySettings } from './settings'

/**
 * Answers for staff when they did not: a one-to-one room whose latest message
 * is from a real user and has waited long enough gets one AI-written reply as
 * the room's operator account.
 *
 * - How long is long enough differs per message (`autoReplyDelayMs`): the
 *   staff-set delay is the typical wait, a popular account (followers, rooms
 *   with real people this week) answers more slowly, about one reply in five
 *   comes almost at once, and now and then one takes much longer, as
 *   people's do. A popular account also leaves some messages unanswered
 *   (`autoReplySkipChance`). A burst of messages gets one reply: only the
 *   room's latest message is ever answered, and its wait starts when it was
 *   sent. The wait and the skip are seeded by the message id,
 *   so every run agrees on when a message is due.
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
/** Rooms read per run to find the due ones: most waiting rooms are not due yet. */
const AUTO_REPLY_SCAN_LIMIT = 300
export const AUTO_REPLY_MAX_AGE_MS = 24 * 60 * 60_000
/** No reply waits longer than this, whatever the popularity and the draw. */
export const AUTO_REPLY_MAX_DELAY_MS = 12 * 60 * 60_000
const POPULARITY_WINDOW_MS = 7 * 24 * 60 * 60_000
/** The shortest any message waits: an instant answer still looks typed. */
export const AUTO_REPLY_MIN_WAIT_MS = 20_000
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
  /** People following the operator account. */
  followers: number
  /** The account's rooms where a real person wrote in the last 7 days. */
  activeRooms: number
}

/** 1 for an account nobody follows or talks to, about 2.6 at 20 points, 4 at 100, 5.6 at 500 (a room counts 3). */
export function popularityFactor(followers: number, activeRooms: number): number {
  const score = Math.max(0, followers) + 3 * Math.max(0, activeRooms)
  return 1 + Math.log(1 + score / 5)
}

/**
 * The share of messages an account leaves unanswered: none for an account
 * nobody follows or talks to, about 8% at 10 points, 29% at 100, 41% at 300,
 * at most 50% (a room counts 3).
 */
export function autoReplySkipChance(followers: number, activeRooms: number): number {
  const score = Math.max(0, followers) + 3 * Math.max(0, activeRooms)
  return Math.min(0.5, 0.12 * Math.log(1 + score / 10))
}

/** Whether this message is one the account leaves unanswered (fixed per message). */
export function autoReplySkips(candidate: Pick<AutoReplyCandidate, 'messageId' | 'followers' | 'activeRooms'>): boolean {
  return seededRandom(`auto-reply-skip:${candidate.messageId}`)() < autoReplySkipChance(candidate.followers, candidate.activeRooms)
}

/**
 * One draw in five is an almost instant answer (0-0.2x). The rest have a long
 * tail: half stay under 1.6x, one in ten passes 5x (capped at 12x).
 */
export const INSTANT_REPLY_SHARE = 0.2
export function replyDelayFactor(random: () => number): number {
  const roll = random()
  if (roll < INSTANT_REPLY_SHARE) return roll
  return Math.min(12, (1 - (roll - INSTANT_REPLY_SHARE) / (1 - INSTANT_REPLY_SHARE)) ** -0.7)
}

/** How long this message waits for staff before the account answers it. */
export function autoReplyDelayMs(candidate: Pick<AutoReplyCandidate, 'messageId' | 'followers' | 'activeRooms'>, delayMinutes: number): number {
  const random = seededRandom(`auto-reply-delay:${candidate.messageId}`)
  const delay = delayMinutes * 60_000 * popularityFactor(candidate.followers, candidate.activeRooms) * replyDelayFactor(random)
  return Math.min(AUTO_REPLY_MAX_DELAY_MS, Math.max(AUTO_REPLY_MIN_WAIT_MS, Math.round(delay)))
}

export type AutoReplyRunSummary = {
  enabled: boolean
  candidates: number
  /** Due messages a popular account leaves unanswered. */
  ignored: number
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

/** Rooms waiting on staff for at least `AUTO_REPLY_MIN_WAIT_MS`, oldest message first. */
export async function findAutoReplyCandidates(args: {
  now: Date
  enabledAt: Date
  limit?: number
}): Promise<AutoReplyCandidate[]> {
  const cutoff = new Date(args.now.getTime() - AUTO_REPLY_MIN_WAIT_MS)
  const since = new Date(Math.max(args.enabledAt.getTime(), args.now.getTime() - AUTO_REPLY_MAX_AGE_MS))
  if (since.getTime() >= cutoff.getTime()) return []
  return prisma.$queryRaw<AutoReplyCandidate[]>(Prisma.sql`
    SELECT
      channel.id AS "conversationId",
      channel.session_key AS "sessionKey",
      member.user_id AS "operatorUserId",
      latest.id AS "messageId",
      latest.created_at AS "createdAt",
      (SELECT COUNT(*)::int FROM app.app_user_follows AS follow WHERE follow.following_id = member.user_id) AS "followers",
      (
        SELECT COUNT(*)::int
        FROM app.app_conversation_channel_members AS own
        JOIN app.app_conversation_channels AS room ON room.id = own.channel_id
        WHERE own.user_id = member.user_id
          AND own.left_at IS NULL
          AND EXISTS (
            SELECT 1 FROM app.app_messages AS recent
            JOIN app.app_users AS writer ON writer.id = recent.user_id AND writer.is_operator = false
            WHERE recent.session_key = room.session_key
              AND recent.created_at > ${sqlUtcTimestamp(new Date(args.now.getTime() - POPULARITY_WINDOW_MS))}
          )
      ) AS "activeRooms"
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
      -- Official accounts (the Hamzzi mascot) are bots too: answering them would never end.
      AND sender.is_official = false
    WHERE member.left_at IS NULL
      -- A staff account (no persona country, e.g. @admin) never answers automatically.
      AND EXISTS (
        SELECT 1 FROM app.app_operator_accounts AS account
        WHERE account.user_id = member.user_id AND account.persona_country IS NOT NULL
      )
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
  const summary: AutoReplyRunSummary = { enabled: settings.enabled, candidates: 0, ignored: 0, sent: 0, declined: 0, skipped: 0, failed: 0 }
  if (!settings.enabled || !settings.enabledAt) return summary

  const checkedAt = now()
  const waiting = await findAutoReplyCandidates({
    now: checkedAt,
    enabledAt: new Date(settings.enabledAt),
    limit: AUTO_REPLY_SCAN_LIMIT,
  })
  const due = waiting.filter((candidate) => new Date(candidate.createdAt).getTime() + autoReplyDelayMs(candidate, settings.delayMinutes) <= checkedAt.getTime())
  const candidates = due.filter((candidate) => !autoReplySkips(candidate)).slice(0, AUTO_REPLY_MAX_ROOMS_PER_RUN)
  summary.ignored = due.length - due.filter((candidate) => !autoReplySkips(candidate)).length
  summary.candidates = candidates.length
  // One at a time: an operator in several rooms keeps a steady pace, and the model is not flooded.
  for (const candidate of candidates) {
    summary[await autoReplyToCandidate(candidate, now())] += 1
  }
  return summary
}
