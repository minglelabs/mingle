/**
 * In-process scheduler for the operator post reserve: a 60 s tick started once
 * per server process from `src/instrumentation.ts`. Runs never overlap (a
 * tick while a run is in flight is skipped). The state lives on `globalThis`
 * because the instrumentation hook and a route handler can load this module
 * as separate instances.
 */
import { runOperatorPostReserve } from './worker'

export const POST_RESERVE_TICK_MS = 60_000
/** First run after boot: soon, but after the server is warm. */
export const POST_RESERVE_FIRST_TICK_MS = 30_000

type SchedulerState = {
  timer: ReturnType<typeof setInterval> | null
  firstTimer: ReturnType<typeof setTimeout> | null
  running: Promise<void> | null
}

const STATE_KEY = Symbol.for('mingle.operatorPostReserveScheduler.v1')

function schedulerState(): SchedulerState {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: SchedulerState }
  holder[STATE_KEY] ??= { timer: null, firstTimer: null, running: null }
  return holder[STATE_KEY]
}

export function runOperatorPostReserveWorker(): Promise<void> {
  const state = schedulerState()
  if (state.running) return state.running
  state.running = (async () => {
    try {
      const summary = await runOperatorPostReserve()
      if (summary.released + summary.releaseFailed + summary.scheduled + summary.generated > 0) console.info('[operator-post-reserve] run', summary)
    } catch (error) {
      console.error('[operator-post-reserve] run_failed', { error: error instanceof Error ? error.name : 'unknown' })
    } finally {
      state.running = null
    }
  })()
  return state.running
}

/** Start the tick once per process. Further calls are no-ops. */
export function startOperatorPostReserveWorker(): void {
  const state = schedulerState()
  if (state.timer) return
  state.firstTimer = setTimeout(() => {
    state.firstTimer = null
    void runOperatorPostReserveWorker()
  }, POST_RESERVE_FIRST_TICK_MS)
  state.timer = setInterval(() => {
    void runOperatorPostReserveWorker()
  }, POST_RESERVE_TICK_MS)
  // Never keep the process alive just for the scheduler.
  state.firstTimer.unref?.()
  state.timer.unref?.()
}

/** Tests only: stop the timers and forget the state. */
export function __resetOperatorPostReserveSchedulerForTests(): void {
  const state = schedulerState()
  if (state.timer) clearInterval(state.timer)
  if (state.firstTimer) clearTimeout(state.firstTimer)
  state.timer = null
  state.firstTimer = null
  state.running = null
}
