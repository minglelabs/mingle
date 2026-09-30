/**
 * When each item of an operator-post batch goes out (contract §5 Scheduling).
 *
 * Pure: the caller supplies the clock, the randomness and the times the
 * operators are already busy at, so the math is testable on its own.
 *
 * - `now`    ("바로 게시"): at once, exactly as asked.
 * - `at`     (explicit time): exactly as asked (the caller validated it).
 * - `spread` (the default): over the next 6 hours, the first one about
 *   2 minutes from now, and never within 30 minutes of another post of the
 *   same operator — whether that one is in this batch, already queued, or
 *   already published. A batch would otherwise land in the feed's "<= 1 h"
 *   tier all at once and fill the top of every feed with operator posts.
 *
 * Posts are never backdated and never get a future `published_at`: these
 * times only decide when the worker calls the unchanged `publishPost`.
 */

export const SPREAD_WINDOW_MS = 6 * 60 * 60_000
export const SPREAD_START_DELAY_MS = 2 * 60_000
export const MIN_OPERATOR_GAP_MS = 30 * 60_000
/** Cap on the random shift of a spread slot, so the posts do not tick like a metronome. */
export const MAX_SPREAD_JITTER_MS = 10 * 60_000

export type PublishRequest = { kind: 'spread' } | { kind: 'now' } | { kind: 'at'; at: Date }

export type PlanPublishTimesInput = {
  now: Date
  items: ReadonlyArray<{ operatorUserId: string; request: PublishRequest }>
  /** Times the operators already post at (queued jobs, their latest published post). */
  anchors?: ReadonlyArray<{ operatorUserId: string; at: Date }>
  /** Returns [0, 1); defaults to Math.random. */
  random?: () => number
}

/** Spread items in round-robin order over their operators (first appearance first), each operator's own order kept. */
function roundRobinOrder(indexes: number[], operatorOf: (index: number) => string): number[] {
  const queues = new Map<string, number[]>()
  for (const index of indexes) {
    const operator = operatorOf(index)
    const queue = queues.get(operator)
    if (queue) queue.push(index)
    else queues.set(operator, [index])
  }
  const order: number[] = []
  const lanes = [...queues.values()]
  for (let round = 0; order.length < indexes.length; round += 1) {
    for (const lane of lanes) {
      if (round < lane.length) order.push(lane[round])
    }
  }
  return order
}

function keepsGap(time: number, taken: readonly number[]): boolean {
  return taken.every((other) => Math.abs(time - other) >= MIN_OPERATOR_GAP_MS)
}

/** The earliest time at or after `from` that keeps the gap to every time in `taken`. */
function earliestFreeTime(from: number, taken: readonly number[]): number {
  const candidates = [from, ...taken.map((time) => time + MIN_OPERATOR_GAP_MS)]
    .filter((time) => time >= from)
    .sort((a, b) => a - b)
  for (const candidate of candidates) {
    if (keepsGap(candidate, taken)) return candidate
  }
  // Unreachable: the latest taken time + the gap always keeps the gap.
  return Math.max(from, ...taken) + MIN_OPERATOR_GAP_MS
}

/** One publish time per item, in item order. */
export function planPublishTimes(input: PlanPublishTimesInput): Date[] {
  const nowMs = input.now.getTime()
  const random = input.random ?? Math.random
  const times: Array<number | null> = input.items.map((item) => {
    if (item.request.kind === 'now') return nowMs
    if (item.request.kind === 'at') return item.request.at.getTime()
    return null
  })

  const taken = new Map<string, number[]>()
  const occupy = (operatorUserId: string, time: number) => {
    const list = taken.get(operatorUserId)
    if (list) list.push(time)
    else taken.set(operatorUserId, [time])
  }
  for (const anchor of input.anchors ?? []) occupy(anchor.operatorUserId, anchor.at.getTime())
  input.items.forEach((item, index) => {
    const time = times[index]
    if (time !== null) occupy(item.operatorUserId, time)
  })

  const spread = input.items.flatMap((_, index) => (times[index] === null ? [index] : []))
  if (spread.length > 0) {
    const start = nowMs + SPREAD_START_DELAY_MS
    const slotMs = SPREAD_WINDOW_MS / spread.length
    const jitterMax = Math.min(slotMs / 2, MAX_SPREAD_JITTER_MS)
    // Strictly increasing: each jitter stays below half a slot.
    const slots = spread.map((_, slot) => ({
      time: Math.round(start + slot * slotMs + Math.min(Math.max(random(), 0), 0.999) * jitterMax),
      used: false,
    }))

    for (const index of roundRobinOrder(spread, (i) => input.items[i].operatorUserId)) {
      const operator = input.items[index].operatorUserId
      const busy = taken.get(operator) ?? []
      const slot = slots.find((candidate) => !candidate.used && keepsGap(candidate.time, busy))
      let time: number
      if (slot) {
        slot.used = true
        time = slot.time
      } else {
        // Too many posts of one operator for the window: keep the gap and run past it.
        time = earliestFreeTime(start, busy)
      }
      occupy(operator, time)
      times[index] = time
    }
  }

  return times.map((time) => new Date(time ?? nowMs))
}
