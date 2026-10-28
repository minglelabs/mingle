/**
 * Report core: the fixed reason list, the target-key normalisation that backs
 * the per-reporter dedup unique index, and the single create path every report
 * endpoint (post / comment / user) funnels through.
 *
 * `UserReport` already carries `targetType` / `targetPostId` / `targetCommentId`
 * / `targetKey` (unique with `reporterId`) / `reason` / `message` (see
 * prisma/schema.prisma), so nothing here touches the schema. `reportedUserId`
 * is always the CONTENT AUTHOR so the admin console keeps one unified list.
 *
 * Reporting never hides or blocks anything — that is a deliberately separate
 * action (hide / block endpoints), and this module performs neither.
 */

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'inappropriate',
  'impersonation',
  'other',
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

const REPORT_REASON_SET = new Set<string>(REPORT_REASONS)

/** Free-text note is optional for every reason (including "other"). */
export const MAX_REPORT_MESSAGE_LENGTH = 500

export type ReportTargetType = 'user' | 'post' | 'comment'

/**
 * The value stored in `UserReport.targetKey`. It is what the
 * `(reporterId, targetKey)` unique index dedups on, so the same reporter
 * reporting the same target twice collides on the first row.
 *
 * A user report and a post/comment report by the same author must never share
 * a key, hence the type prefix.
 */
export function buildReportTargetKey(
  targetType: ReportTargetType,
  targetId: string,
): string {
  return `${targetType}:${targetId.trim()}`
}

export function normalizeReportReason(value: unknown): ReportReason | null {
  if (typeof value !== 'string') return null
  const reason = value.trim().toLowerCase()
  return REPORT_REASON_SET.has(reason) ? (reason as ReportReason) : null
}

/**
 * Returns the trimmed note capped at MAX_REPORT_MESSAGE_LENGTH, or null when
 * absent/blank. A non-string, non-null message is a caller error and returns
 * the `invalid` sentinel so the route can answer 400.
 */
export function normalizeReportMessage(
  value: unknown,
): { ok: true; message: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, message: null }
  if (typeof value !== 'string') return { ok: false }
  const message = value.trim()
  if (!message) return { ok: true, message: null }
  return { ok: true, message: message.slice(0, MAX_REPORT_MESSAGE_LENGTH) }
}

export type CreateReportInput = {
  reporterId: string
  /** The content author. For a user report this is the reported user. */
  reportedUserId: string
  targetType: ReportTargetType
  /** Post id for a post report; null otherwise. */
  targetPostId?: string | null
  /** Comment id for a comment report; null otherwise. */
  targetCommentId?: string | null
  reason: ReportReason
  message: string | null
}

export type CreateReportResult =
  | { status: 'created'; reportId: string; reportStatus: string }
  | { status: 'duplicate' }

/**
 * The Prisma surface this service needs, so tests inject a mock instead of a
 * live client (matching the *-service.test.ts pattern in this repo).
 */
export type ReportServiceDeps = {
  userReport: {
    create: (args: {
      data: {
        reporterId: string
        reportedUserId: string
        targetType: string
        targetPostId: string | null
        targetCommentId: string | null
        targetKey: string
        reason: string
        message?: string
      }
      select: { id: true; status: true }
    }) => Promise<{ id: string; status: string }>
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  )
}

/**
 * Create a report, deduped per reporter+target by the unique index. The FIRST
 * report of a given target wins; every later attempt returns `duplicate`
 * (never an error), which the UI surfaces as "already reported".
 */
export async function createReport(
  deps: ReportServiceDeps,
  input: CreateReportInput,
): Promise<CreateReportResult> {
  const targetId =
    input.targetType === 'post'
      ? input.targetPostId
      : input.targetType === 'comment'
        ? input.targetCommentId
        : input.reportedUserId
  const targetKey = buildReportTargetKey(input.targetType, String(targetId ?? ''))

  try {
    const report = await deps.userReport.create({
      data: {
        reporterId: input.reporterId,
        reportedUserId: input.reportedUserId,
        targetType: input.targetType,
        targetPostId: input.targetPostId ?? null,
        targetCommentId: input.targetCommentId ?? null,
        targetKey,
        reason: input.reason,
        ...(input.message ? { message: input.message } : {}),
      },
      select: { id: true, status: true },
    })
    return { status: 'created', reportId: report.id, reportStatus: report.status }
  } catch (err) {
    if (isUniqueViolation(err)) return { status: 'duplicate' }
    throw err
  }
}
