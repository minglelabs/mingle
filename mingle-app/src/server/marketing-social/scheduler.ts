/**
 * In-process scheduler for marketing video cross-posting: a 15 s tick started
 * once per server process from `src/instrumentation.ts`. Each platform (and
 * the token/metrics upkeep) is its own lane: a tick starts every lane that is
 * not still running, so a minutes-long YouTube upload never stalls Instagram
 * or Threads polling. A lane never overlaps itself. State lives on
 * `globalThis` (instrumentation and route handlers may load this module as
 * separate instances).
 */
import { runWorkerLane, WORKER_LANES, type WorkerLane } from './worker'

export const MARKETING_SOCIAL_TICK_MS = 15_000

type SchedulerState = { timer: ReturnType<typeof setInterval> | null; running: Map<WorkerLane, Promise<void>> }

const STATE_KEY = Symbol.for('mingle.marketingSocialScheduler.v2')

function schedulerState(): SchedulerState {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: SchedulerState }
  holder[STATE_KEY] ??= { timer: null, running: new Map() }
  return holder[STATE_KEY]
}

function startLane(lane: WorkerLane): Promise<void> {
  const state = schedulerState()
  const running = state.running.get(lane)
  if (running) return running
  const promise = (async () => {
    try {
      const summary = await runWorkerLane(lane)
      if (Object.values(summary).some((n) => n > 0)) console.info('[marketing-social] run', { lane, ...summary })
    } catch (error) {
      console.error('[marketing-social] run_failed', { lane, error: error instanceof Error ? error.name : 'unknown' })
    } finally {
      state.running.delete(lane)
    }
  })()
  state.running.set(lane, promise)
  return promise
}

/** Start every idle lane; resolves when the lanes started (or already running) finish. */
export async function runMarketingSocialTick(): Promise<void> {
  await Promise.allSettled(WORKER_LANES.map(startLane))
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

/** Tests only. */
export function __resetMarketingSocialSchedulerForTests(): void {
  const state = schedulerState()
  if (state.timer) clearInterval(state.timer)
  state.timer = null
  state.running.clear()
}
