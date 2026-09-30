import { runBioVersion, updateProfileWithBio } from '@/server/profile-bio'

/**
 * Operator bios go through the normal bio-versioning path
 * (`updateProfileWithBio` + `runBioVersion`, as the profile PATCH does), so
 * they are translated like any user's bio. Bulk creation would otherwise start
 * one source detection + 4 translations per account at once, so this
 * in-process queue runs at most 2 at a time.
 *
 * `prepareBioEdit` gives each new bio version a 55 s deadline from the moment
 * it is written, and `runBioVersion` skips a version whose deadline passed.
 * A created account's bio is therefore WRITTEN when its queue slot starts, not
 * when the account is created; otherwise the tail of a 20-account batch would
 * expire untranslated while waiting. Edits write the bio synchronously and
 * queue only the translation, at the front.
 *
 * The queue lives in memory: a restart drops bios still waiting (the account
 * then has no bio until staff save it again). Nothing here throws to callers.
 */

export const OPERATOR_BIO_CONCURRENCY = 2

type Task = { run: () => Promise<void>; userId: string | null }

const queue: Task[] = []
const pendingUserIds = new Map<string, number>()
let running = 0
let idleWaiters: Array<() => void> = []

function trackPending(userId: string | null, delta: 1 | -1): void {
  if (!userId) return
  const next = (pendingUserIds.get(userId) ?? 0) + delta
  if (next > 0) pendingUserIds.set(userId, next)
  else pendingUserIds.delete(userId)
}

function settleIdleWaiters(): void {
  if (running > 0 || queue.length > 0) return
  const waiters = idleWaiters
  idleWaiters = []
  for (const resolve of waiters) resolve()
}

function pump(): void {
  while (running < OPERATOR_BIO_CONCURRENCY && queue.length > 0) {
    const task = queue.shift()!
    running += 1
    void task.run()
      .catch(error => {
        console.error('[operator-bio] task_failed', { error: error instanceof Error ? error.name : 'unknown' })
      })
      .finally(() => {
        running -= 1
        trackPending(task.userId, -1)
        pump()
        settleIdleWaiters()
      })
  }
}

/** Create path: write `bio` through bio-versioning when a slot is free, then translate it. */
export function enqueueOperatorBioWrite(userId: string, bio: string): void {
  trackPending(userId, 1)
  queue.push({
    userId,
    run: async () => {
      const { versionId } = await updateProfileWithBio(userId, bio, tx => tx.user.update({
        where: { id: userId },
        data: { bio },
        select: { id: true },
      }))
      if (versionId) await runBioVersion(versionId)
    },
  })
  pump()
}

/** Edit path: the bio is already written; translate this version before any waiting bulk work. */
export function enqueueOperatorBioRun(versionId: string, userId: string | null = null): void {
  trackPending(userId, 1)
  queue.unshift({ userId, run: () => runBioVersion(versionId) })
  pump()
}

/** True while a queued or running bio task for this account has not finished (this process only). */
export function isOperatorBioPending(userId: string): boolean {
  return pendingUserIds.has(userId)
}

/** Resolves once nothing is queued or running (for `after()` and tests). */
export function whenOperatorBioQueueIdle(): Promise<void> {
  if (running === 0 && queue.length === 0) return Promise.resolve()
  return new Promise(resolve => {
    idleWaiters.push(resolve)
  })
}
