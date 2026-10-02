/**
 * Publishes due operator post jobs through the UNCHANGED `publishPost`.
 *
 * - Claim: one atomic `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP
 *   LOCKED) RETURNING`, so two runs (two replicas, a tick racing a kick)
 *   never publish the same job twice. `attempts` is bumped by the claim and
 *   doubles as the fencing token of every later write for that claim.
 * - Publish: the job's `clientPostId` is the post id, so a retried publish
 *   answers `duplicate` instead of posting twice.
 * - Errors: back to `queued` after 2^attempts minutes, `failed` after 5
 *   attempts. A job stuck in `publishing` for 10 minutes (the process died
 *   mid-publish) is requeued.
 * - Never the per-user rate limiter, tracked activity or analytics.
 */
import { prisma } from '@/lib/prisma'
import { writeAdminAudit } from '@/server/admin/audit'
import { isOwnedPostImageKey } from '@/server/posts/post-image-keys'
import { publishPost, type PublishPostResult } from '@/server/posts/publish-post'
import { checkOperatorForPosting, personaLanguageOf } from './operator-check'
import { sqlUtcTimestamp } from './sql'
import { OPERATOR_POST_MAX_ATTEMPTS } from './types'

export { OPERATOR_POST_MAX_ATTEMPTS }
export const OPERATOR_POST_WORKER_CONCURRENCY = 3
export const OPERATOR_POST_STALE_PUBLISHING_MS = 10 * 60_000
/** Jobs one run publishes at most; the next tick continues. */
export const OPERATOR_POST_MAX_JOBS_PER_RUN = 60
const MAX_ERROR_LENGTH = 500

/** Delay before retry number `attempts + 1`: 2, 4, 8, 16 minutes. */
export function operatorPostRetryDelayMs(attempts: number): number {
  return 2 ** Math.max(attempts, 0) * 60_000
}

export type ClaimedOperatorPostJob = {
  id: string
  batchId: string
  operatorUserId: string
  clientPostId: string
  text: string | null
  imageObjectKey: string | null
  imageWidth: number | null
  imageHeight: number | null
  backgroundKey: string | null
  /** Attempts INCLUDING this claim. */
  attempts: number
}

export type OperatorPostRunSummary = {
  staleRequeued: number
  staleFailed: number
  claimed: number
  published: number
  duplicate: number
  conflict: number
  failed: number
  retried: number
}

type Outcome = 'published' | 'duplicate' | 'conflict' | 'failed' | 'retried'

function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown_error'
  return text.slice(0, MAX_ERROR_LENGTH)
}

/**
 * `publishing` rows whose claim is older than 10 minutes: the publish never
 * finished (a deploy or crash killed it). Requeued at once — safe, because
 * the clientPostId makes a repeated publish a duplicate — unless the job is
 * out of attempts, then failed.
 */
export async function requeueStalePublishingJobs(now: Date): Promise<{ requeued: number; failed: number }> {
  const claimedBefore = new Date(now.getTime() - OPERATOR_POST_STALE_PUBLISHING_MS)
  const exhausted = await prisma.operatorPostJob.updateMany({
    where: { state: 'publishing', updatedAt: { lt: claimedBefore }, attempts: { gte: OPERATOR_POST_MAX_ATTEMPTS } },
    data: { state: 'failed', error: 'publish_timed_out' },
  })
  const requeued = await prisma.operatorPostJob.updateMany({
    where: { state: 'publishing', updatedAt: { lt: claimedBefore } },
    data: { state: 'queued', error: 'publish_interrupted' },
  })
  return { requeued: requeued.count, failed: exhausted.count }
}

/** Atomically claim up to `limit` due queued jobs (oldest publish time first). */
export async function claimDueOperatorPostJobs(now: Date, limit: number): Promise<ClaimedOperatorPostJob[]> {
  return prisma.$queryRaw<ClaimedOperatorPostJob[]>`
    UPDATE app_operator_post_jobs
    SET state = 'publishing', attempts = attempts + 1, updated_at = ${sqlUtcTimestamp(now)}
    WHERE id IN (
      SELECT id FROM app_operator_post_jobs
      WHERE state = 'queued' AND publish_at <= ${sqlUtcTimestamp(now)}
      ORDER BY publish_at ASC, id ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id,
      batch_id AS "batchId",
      operator_user_id AS "operatorUserId",
      client_post_id AS "clientPostId",
      text,
      image_object_key AS "imageObjectKey",
      image_width AS "imageWidth",
      image_height AS "imageHeight",
      background_key AS "backgroundKey",
      attempts
  `
}

/** Write the outcome of THIS claim only (state + attempts fence off a requeue that happened meanwhile). */
async function settle(
  job: ClaimedOperatorPostJob,
  data: { state: string; postId?: string | null; error?: string | null; publishAt?: Date },
): Promise<void> {
  try {
    const result = await prisma.operatorPostJob.updateMany({
      where: { id: job.id, state: 'publishing', attempts: job.attempts },
      data,
    })
    if (result.count === 0) {
      console.warn('[operator-post-worker] settle_skipped', { jobId: job.id, state: data.state })
    }
  } catch (error) {
    // The row stays `publishing` and is requeued as stale; the retry is a duplicate.
    console.error('[operator-post-worker] settle_failed', {
      jobId: job.id,
      state: data.state,
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
}

async function retryOrFail(job: ClaimedOperatorPostJob, error: unknown, now: Date): Promise<Outcome> {
  const message = describeError(error)
  if (job.attempts >= OPERATOR_POST_MAX_ATTEMPTS) {
    await settle(job, { state: 'failed', error: message })
    return 'failed'
  }
  await settle(job, {
    state: 'queued',
    error: message,
    publishAt: new Date(now.getTime() + operatorPostRetryDelayMs(job.attempts)),
  })
  return 'retried'
}

/** Publish one claimed job and record the result. Never throws. */
export async function publishClaimedOperatorPostJob(
  job: ClaimedOperatorPostJob,
  now: () => Date = () => new Date(),
): Promise<Outcome> {
  let result: PublishPostResult
  try {
    // Acting as the operator: re-check the account at publish time (it may
    // have been retired or restricted since the batch was queued).
    const check = await checkOperatorForPosting(job.operatorUserId)
    if (!check.ok) {
      await settle(job, { state: 'failed', error: check.reason })
      return 'failed'
    }
    if (job.imageObjectKey !== null && !isOwnedPostImageKey(job.imageObjectKey, job.operatorUserId)) {
      await settle(job, { state: 'failed', error: 'invalid_image_key' })
      return 'failed'
    }
    const hasImage = job.imageObjectKey !== null
    result = await publishPost({
      authorId: job.operatorUserId,
      text: job.text,
      imageObjectKey: job.imageObjectKey,
      imageDimensions:
        hasImage && job.imageWidth !== null && job.imageHeight !== null
          ? { imageWidth: job.imageWidth, imageHeight: job.imageHeight }
          : null,
      clientHint: personaLanguageOf(check.account),
      clientPostId: job.clientPostId,
      backgroundKey: job.backgroundKey,
    })
  } catch (error) {
    return retryOrFail(job, error, now())
  }

  if (result.kind === 'conflict') {
    await settle(job, { state: 'conflict', error: 'client_post_id_conflict' })
    return 'conflict'
  }

  const state = result.kind === 'created' ? 'published' : 'duplicate'
  await settle(job, { state, postId: result.post.id, error: null })
  await writeAdminAudit(null, {
    action: 'operator_post.published',
    operatorUserId: job.operatorUserId,
    targetType: 'post',
    targetId: result.post.id,
    metadata: {
      jobId: job.id,
      batchId: job.batchId,
      clientPostId: job.clientPostId,
      result: result.kind,
      ...(result.kind === 'created' ? { sourceLanguage: result.sourceLanguage } : {}),
    },
  })
  return state
}

/**
 * One worker run: requeue stale claims, then publish due jobs with
 * `concurrency` parallel slots, each claiming one job at a time, until nothing
 * is due or `maxJobs` were claimed.
 */
export async function runDueOperatorPostJobs(
  options: { now?: () => Date; concurrency?: number; maxJobs?: number } = {},
): Promise<OperatorPostRunSummary> {
  const now = options.now ?? (() => new Date())
  const concurrency = Math.max(1, options.concurrency ?? OPERATOR_POST_WORKER_CONCURRENCY)
  let remaining = Math.max(0, options.maxJobs ?? OPERATOR_POST_MAX_JOBS_PER_RUN)

  const stale = await requeueStalePublishingJobs(now())
  const summary: OperatorPostRunSummary = {
    staleRequeued: stale.requeued,
    staleFailed: stale.failed,
    claimed: 0,
    published: 0,
    duplicate: 0,
    conflict: 0,
    failed: 0,
    retried: 0,
  }

  let drained = false
  const slot = async () => {
    while (!drained && remaining > 0) {
      remaining -= 1
      const [job] = await claimDueOperatorPostJobs(now(), 1)
      if (!job) {
        drained = true
        return
      }
      summary.claimed += 1
      summary[await publishClaimedOperatorPostJob(job, now)] += 1
    }
  }
  await Promise.all(Array.from({ length: concurrency }, slot))
  return summary
}
