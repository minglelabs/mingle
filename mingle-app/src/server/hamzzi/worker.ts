import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ensureHamzziAccount, HAMZZI_USER_ID } from '@/lib/hamzzi'
import { sendOfficialAccountMessage } from '@/server/operator-inbox/send'
import { sqlUtcTimestamp } from '@/server/operator-posts/sql'
import { generateHamzziReply, loadHamzziReplyContext } from './reply'

/**
 * Hamzzi answers every one-to-one room whose latest message is from the other
 * person once they have been quiet for `HAMZZI_REPLY_DELAY_MS`, so a burst of
 * short messages gets one reply that answers them together (prompt.ts). Always on; `HAMZZI_AUTO_REPLY=off` turns it off.
 *
 * - The request id is derived from the answered message, so two runs (or two
 *   replicas) never answer the same message twice.
 * - A message that fails 3 times in this process is given up.
 * - Messages older than a day are never answered (e.g. after an outage).
 */
export const HAMZZI_REPLY_DELAY_MS = 8_000
export const HAMZZI_MAX_AGE_MS = 24 * 60 * 60_000
export const HAMZZI_MAX_ROOMS_PER_RUN = 20
export const HAMZZI_CONCURRENCY = 3
export const HAMZZI_MAX_ATTEMPTS = 3
const MAX_TRACKED_MESSAGES = 2_000

export type HamzziCandidate = {
  conversationId: string
  sessionKey: string
  userId: string
  messageId: string
  createdAt: Date
}

export type HamzziRunSummary = { candidates: number; sent: number; declined: number; skipped: number; failed: number }

const STATE_KEY = Symbol.for('mingle.hamzziAutoReply.attempts.v1')

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

export function __resetHamzziAttemptsForTests(): void {
  attemptsByMessage().clear()
}

export function hamzziAutoReplyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HAMZZI_AUTO_REPLY !== 'off'
}

/** `hamzzi-<messageId>`, restricted to the characters a request id allows. */
export function hamzziRequestId(messageId: string): string {
  return `hamzzi-${messageId.replace(/[^A-Za-z0-9-]/g, '')}`.slice(0, 64)
}

/** Rooms waiting on Hamzzi, oldest message first. */
export async function findHamzziCandidates(args: { now: Date; limit?: number }): Promise<HamzziCandidate[]> {
  const cutoff = new Date(args.now.getTime() - HAMZZI_REPLY_DELAY_MS)
  const since = new Date(args.now.getTime() - HAMZZI_MAX_AGE_MS)
  return prisma.$queryRaw<HamzziCandidate[]>(Prisma.sql`
    SELECT
      channel.id AS "conversationId",
      channel.session_key AS "sessionKey",
      latest.user_id AS "userId",
      latest.id AS "messageId",
      latest.created_at AS "createdAt"
    FROM app.app_conversation_channel_members AS member
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
    -- Never a staff-run operator persona: its own auto-reply would answer back forever.
    JOIN app.app_users AS sender
      ON sender.id = latest.user_id
      AND sender.is_operator = false
    WHERE member.user_id = ${HAMZZI_USER_ID}
      AND member.left_at IS NULL
      AND latest.user_id IS NOT NULL
      AND latest.user_id <> ${HAMZZI_USER_ID}
      AND latest.created_at <= ${sqlUtcTimestamp(cutoff)}
      AND latest.created_at > ${sqlUtcTimestamp(since)}
      AND (
        SELECT COUNT(*) FROM app.app_conversation_channel_members AS other
        WHERE other.channel_id = channel.id AND other.left_at IS NULL
      ) = 2
    ORDER BY latest.created_at ASC
    LIMIT ${args.limit ?? HAMZZI_MAX_ROOMS_PER_RUN}
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

/** Answer one room. Never throws. */
export async function replyAsHamzzi(candidate: HamzziCandidate): Promise<Outcome> {
  const used = attemptsByMessage().get(candidate.messageId) ?? 0
  if (used >= HAMZZI_MAX_ATTEMPTS) return 'skipped'
  recordAttempt(candidate.messageId, used + 1)
  try {
    const hamzzi = await ensureHamzziAccount()
    const context = hamzzi ? await loadHamzziReplyContext({ sessionKey: candidate.sessionKey, userId: candidate.userId }) : null
    if (!hamzzi || !context) {
      recordAttempt(candidate.messageId, HAMZZI_MAX_ATTEMPTS)
      return 'skipped'
    }
    const reply = await generateHamzziReply(context)
    if (!reply.text) {
      recordAttempt(candidate.messageId, HAMZZI_MAX_ATTEMPTS)
      return 'declined'
    }
    // The user may have written again while the model was thinking: answer that next run.
    if ((await latestMessageId(candidate.sessionKey)) !== candidate.messageId) return 'skipped'

    const result = await sendOfficialAccountMessage({
      sender: hamzzi,
      sourceLanguage: reply.language,
      operatorUserId: hamzzi.id,
      conversationId: candidate.conversationId,
      text: reply.text,
      clientRequestId: hamzziRequestId(candidate.messageId),
    })
    recordAttempt(candidate.messageId, HAMZZI_MAX_ATTEMPTS)
    return result.duplicate ? 'skipped' : 'sent'
  } catch (error) {
    // Never the message text: the code or error name only.
    console.warn('[hamzzi] reply_failed', {
      conversationId: candidate.conversationId,
      attempt: used + 1,
      error: error instanceof Error ? (error as { code?: string }).code ?? error.name : 'unknown',
    })
    return 'failed'
  }
}

/** One worker run: up to `HAMZZI_CONCURRENCY` rooms at a time. */
export async function runHamzziAutoReplies(options: { now?: () => Date } = {}): Promise<HamzziRunSummary> {
  const now = options.now ?? (() => new Date())
  const summary: HamzziRunSummary = { candidates: 0, sent: 0, declined: 0, skipped: 0, failed: 0 }
  if (!hamzziAutoReplyEnabled()) return summary
  const candidates = await findHamzziCandidates({ now: now() })
  summary.candidates = candidates.length
  let next = 0
  const lanes = Array.from({ length: Math.min(HAMZZI_CONCURRENCY, candidates.length) }, async () => {
    while (next < candidates.length) {
      const candidate = candidates[next]
      next += 1
      summary[await replyAsHamzzi(candidate)] += 1
    }
  })
  await Promise.all(lanes)
  return summary
}
