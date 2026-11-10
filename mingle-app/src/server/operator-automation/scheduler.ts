/**
 * In-process scheduler for operator automation (photos, accounts): a 60 s tick started once
 * per server process from `src/instrumentation.ts`. Runs never overlap (a
 * tick while a run is in flight is skipped). The state lives on `globalThis`
 * because the instrumentation hook and a route handler can load this module
 * as separate instances.
 */
import { runOperatorAutomation } from './worker'

export const AUTOMATION_TICK_MS = 60_000
/** First run after boot: soon, but after the server is warm. */
export const AUTOMATION_FIRST_TICK_MS = 40_000

type SchedulerState = {
  timer: ReturnType<typeof setInterval> | null
  firstTimer: ReturnType<typeof setTimeout> | null
  running: Promise<void> | null
  runningSince?: number | null
}

const STATE_KEY = Symbol.for('mingle.operatorAutomationScheduler.v1')

function schedulerState(): SchedulerState {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: SchedulerState }
  holder[STATE_KEY] ??= { timer: null, firstTimer: null, running: null, runningSince: null }
  return holder[STATE_KEY]
}

/** A run longer than this is treated as stuck: later ticks may start a new one. */
const STUCK_RUN_MS = 30 * 60_000

export function runOperatorAutomationWorker(): Promise<void> {
  const state = schedulerState()
  if (state.running) {
    if (Date.now() - (state.runningSince ?? Date.now()) < STUCK_RUN_MS) return state.running
    console.warn('[operator-automation] stuck_run_released', { sinceMs: Date.now() - (state.runningSince ?? Date.now()) })
  }
  const startedAt = Date.now()
  state.runningSince = startedAt
  const run: Promise<void> = (async () => {
    try {
      const summary = await runOperatorAutomation()
      if (['generated', 'failed'].includes(summary.avatar) || ['created', 'failed'].includes(summary.account) || typeof summary.posts === 'object') console.info('[operator-automation] run', summary)
    } catch (error) {
      console.error('[operator-automation] run_failed', { error: error instanceof Error ? `${error.name}: ${error.message.slice(0, 120)}` : 'unknown' })
    } finally {
      // Only the run that is still current clears the slot (a released stuck run must not clear its successor).
      if (state.runningSince === startedAt) {
        state.running = null
        state.runningSince = null
      }
    }
  })()
  state.running = run
  return run
}

/** Start the tick once per process. Further calls are no-ops. */
export function startOperatorAutomationWorker(): void {
  const state = schedulerState()
  if (state.timer) return
  console.info('[operator-automation] worker_started', { firstTickMs: AUTOMATION_FIRST_TICK_MS, tickMs: AUTOMATION_TICK_MS })
  state.firstTimer = setTimeout(() => {
    state.firstTimer = null
    void runOperatorAutomationWorker()
  }, AUTOMATION_FIRST_TICK_MS)
  state.timer = setInterval(() => {
    void runOperatorAutomationWorker()
  }, AUTOMATION_TICK_MS)
  // Never keep the process alive just for the scheduler.
  state.firstTimer.unref?.()
  state.timer.unref?.()
}

/** Tests only: stop the timers and forget the state. */
export function __resetOperatorAutomationSchedulerForTests(): void {
  const state = schedulerState()
  if (state.timer) clearInterval(state.timer)
  if (state.firstTimer) clearTimeout(state.firstTimer)
  state.timer = null
  state.firstTimer = null
  state.running = null
}
