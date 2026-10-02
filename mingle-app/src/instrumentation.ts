/**
 * Next.js instrumentation hook: `register()` runs once per server process.
 *
 * It starts the operator-post scheduler (a 60 s tick that publishes due
 * `app_operator_post_jobs` through the unchanged `publishPost`) — only on the
 * Node.js runtime, never under tests, and not when
 * `MINGLE_OPERATOR_POST_WORKER=off`. The scheduler is imported dynamically
 * inside the `NEXT_RUNTIME === 'nodejs'` branch, so none of it (Prisma, the
 * translation engine) reaches an edge bundle.
 */

/** Whether this process may run the operator-post worker. */
export function operatorPostWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NEXT_RUNTIME !== 'nodejs') return false
  if (env.VITEST || env.NODE_ENV === 'test') return false
  return env.MINGLE_OPERATOR_POST_WORKER !== 'off'
}

/**
 * Whether this process may run the operator auto-reply worker (a 30 s tick
 * that answers rooms staff left waiting longer than the delay set in
 * `/admin/settings/auto-reply`). The worker itself does nothing while that
 * setting is off; `MINGLE_OPERATOR_AUTO_REPLY_WORKER=off` keeps it from
 * starting at all.
 */
export function operatorAutoReplyWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NEXT_RUNTIME !== 'nodejs') return false
  if (env.VITEST || env.NODE_ENV === 'test') return false
  return env.MINGLE_OPERATOR_AUTO_REPLY_WORKER !== 'off'
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (operatorPostWorkerEnabled()) {
      const { startOperatorPostWorker } = await import('./server/operator-posts/scheduler')
      startOperatorPostWorker()
    }
    if (operatorAutoReplyWorkerEnabled()) {
      const { startOperatorAutoReplyWorker } = await import('./server/operator-auto-reply/scheduler')
      startOperatorAutoReplyWorker()
    }
  }
}

/**
 * Publish due jobs now instead of at the next tick; used right after a batch
 * with due items ("바로 게시") is queued. Fire-and-forget; same guard as
 * `register()`.
 */
export function kickOperatorPostWorker(): void {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (!operatorPostWorkerEnabled()) return
    void import('./server/operator-posts/scheduler')
      .then(({ kickOperatorPostWorker: kick }) => kick())
      .catch((error: unknown) => {
        console.error('[operator-post-worker] kick_failed', {
          error: error instanceof Error ? error.name : 'unknown',
        })
      })
  }
}
