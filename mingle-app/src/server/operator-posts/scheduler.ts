/**
 * In-process scheduler for operator post jobs (decisions.md #21): a 60 s
 * tick started once per server process from `src/instrumentation.ts`, plus a
 * kick right after a batch with due items.
 *
 * Runs never overlap: a tick while a run is in flight is skipped, a kick is
 * remembered and runs once the current run ends. The state lives on
 * `globalThis`, because the instrumentation hook and a route handler can load
 * this module as separate instances; the claim in ./worker.ts is atomic, so
 * even two processes (replicas) never publish the same job twice.
 */
import { runDueOperatorPostJobs, type OperatorPostRunSummary } from './worker'

export const OPERATOR_POST_TICK_MS = 60_000
/** First run after boot: soon, but after the server is warm. */
export const OPERATOR_POST_FIRST_TICK_MS = 15_000

type SchedulerState = {
  timer: ReturnType<typeof setInterval> | null
  firstTimer: ReturnType<typeof setTimeout> | null
  running: Promise<void> | null
  rerun: boolean
}

const STATE_KEY = Symbol.for('mingle.operatorPostScheduler.v1')

function schedulerState(): SchedulerState {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: SchedulerState }
  holder[STATE_KEY] ??= { timer: null, firstTimer: null, running: null, rerun: false }
  return holder[STATE_KEY]
}

function hasWork(summary: OperatorPostRunSummary): boolean {
  return summary.claimed > 0 || summary.staleRequeued > 0 || summary.staleFailed > 0
}

/**
 * Start a run unless one is in flight. `kick` asks for one more run after
 * the current one (new due jobs may have arrived while it was finishing);
 * `tick` is simply skipped.
 */
export function runOperatorPostWorker(reason: 'tick' | 'kick'): Promise<void> {
  const state = schedulerState()
  if (state.running) {
    if (reason === 'kick') state.rerun = true
    return state.running
  }
  state.running = (async () => {
    try {
      do {
        state.rerun = false
        const summary = await runDueOperatorPostJobs()
        if (hasWork(summary)) console.info('[operator-post-worker] run', { reason, ...summary })
      } while (state.rerun)
    } catch (error) {
      console.error('[operator-post-worker] run_failed', {
        reason,
        error: error instanceof Error ? error.name : 'unknown',
      })
    } finally {
      state.running = null
      state.rerun = false
    }
  })()
  return state.running
}

/** Start the tick once per process. Further calls are no-ops. */
export function startOperatorPostWorker(): void {
  const state = schedulerState()
  if (state.timer) return
  state.firstTimer = setTimeout(() => {
    state.firstTimer = null
    void runOperatorPostWorker('tick')
  }, OPERATOR_POST_FIRST_TICK_MS)
  state.timer = setInterval(() => {
    void runOperatorPostWorker('tick')
  }, OPERATOR_POST_TICK_MS)
  // Never keep the process alive just for the scheduler.
  state.firstTimer.unref?.()
  state.timer.unref?.()
}

/** Run as soon as possible (a batch with due items was just queued). */
export function kickOperatorPostWorker(): void {
  void runOperatorPostWorker('kick')
}

/** Tests only: stop the timers and forget the state. */
export function __resetOperatorPostSchedulerForTests(): void {
  const state = schedulerState()
  if (state.timer) clearInterval(state.timer)
  if (state.firstTimer) clearTimeout(state.firstTimer)
  state.timer = null
  state.firstTimer = null
  state.running = null
  state.rerun = false
}
