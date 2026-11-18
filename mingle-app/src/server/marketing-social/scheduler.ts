/**
 * In-process scheduler for marketing video cross-posting: a 15 s tick started
 * once per server process from `src/instrumentation.ts`. Runs never overlap.
 * State lives on `globalThis` (instrumentation and route handlers may load
 * this module as separate instances).
 */
import { runMarketingSocialWorker } from './worker'

export const MARKETING_SOCIAL_TICK_MS = 15_000

type SchedulerState = { timer: ReturnType<typeof setInterval> | null; running: Promise<void> | null }

const STATE_KEY = Symbol.for('mingle.marketingSocialScheduler.v1')

function schedulerState(): SchedulerState {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: SchedulerState }
  holder[STATE_KEY] ??= { timer: null, running: null }
  return holder[STATE_KEY]
}

export function runMarketingSocialTick(): Promise<void> {
  const state = schedulerState()
  if (state.running) return state.running
  state.running = (async () => {
    try {
      const summary = await runMarketingSocialWorker()
      if (Object.values(summary).some((n) => n > 0)) console.info('[marketing-social] run', summary)
    } catch (error) {
      console.error('[marketing-social] run_failed', { error: error instanceof Error ? error.name : 'unknown' })
    } finally {
      state.running = null
    }
  })()
  return state.running
}

export function startMarketingSocialWorker(): void {
  const state = schedulerState()
  if (state.timer) return
  state.timer = setInterval(() => void runMarketingSocialTick(), MARKETING_SOCIAL_TICK_MS)
  state.timer.unref?.()
}

/** Run now instead of at the next tick (after a new post or a retry). */
export function kickMarketingSocialWorker(): void {
  void runMarketingSocialTick()
}
