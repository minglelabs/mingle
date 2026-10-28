/**
 * In-process scheduler for operator auto-replies: a 30 s tick started once
 * per server process from `src/instrumentation.ts`. Runs never overlap (a
 * tick while a run is in flight is skipped). The state lives on `globalThis`
 * because the instrumentation hook and a route handler can load this module
 * as separate instances.
 */
import { runOperatorAutoReplies } from './worker'

export const AUTO_REPLY_TICK_MS = 30_000
/** First run after boot: soon, but after the server is warm. */
export const AUTO_REPLY_FIRST_TICK_MS = 20_000

type SchedulerState = {
  timer: ReturnType<typeof setInterval> | null
  firstTimer: ReturnType<typeof setTimeout> | null
  running: Promise<void> | null
}

const STATE_KEY = Symbol.for('mingle.operatorAutoReplyScheduler.v1')

function schedulerState(): SchedulerState {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: SchedulerState }
  holder[STATE_KEY] ??= { timer: null, firstTimer: null, running: null }
  return holder[STATE_KEY]
}

export function runOperatorAutoReplyWorker(): Promise<void> {
  const state = schedulerState()
  if (state.running) return state.running
  state.running = (async () => {
    try {
      const summary = await runOperatorAutoReplies()
      if (summary.candidates > 0) console.info('[operator-auto-reply] run', summary)
    } catch (error) {
      console.error('[operator-auto-reply] run_failed', { error: error instanceof Error ? error.name : 'unknown' })
    } finally {
      state.running = null
    }
  })()
  return state.running
}

/** Start the tick once per process. Further calls are no-ops. */
export function startOperatorAutoReplyWorker(): void {
  const state = schedulerState()
  if (state.timer) return
  state.firstTimer = setTimeout(() => {
    state.firstTimer = null
    void runOperatorAutoReplyWorker()
  }, AUTO_REPLY_FIRST_TICK_MS)
  state.timer = setInterval(() => {
    void runOperatorAutoReplyWorker()
  }, AUTO_REPLY_TICK_MS)
  // Never keep the process alive just for the scheduler.
  state.firstTimer.unref?.()
  state.timer.unref?.()
}

/** Tests only: stop the timers and forget the state. */
export function __resetOperatorAutoReplySchedulerForTests(): void {
  const state = schedulerState()
  if (state.timer) clearInterval(state.timer)
  if (state.firstTimer) clearTimeout(state.firstTimer)
  state.timer = null
  state.firstTimer = null
  state.running = null
}
