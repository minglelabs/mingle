import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('./worker', () => ({ runDueOperatorPostJobs: m.run }))

import {
  __resetOperatorPostSchedulerForTests,
  kickOperatorPostWorker,
  OPERATOR_POST_FIRST_TICK_MS,
  OPERATOR_POST_TICK_MS,
  runOperatorPostWorker,
  startOperatorPostWorker,
} from './scheduler'

const EMPTY = {
  staleRequeued: 0,
  staleFailed: 0,
  claimed: 0,
  published: 0,
  duplicate: 0,
  conflict: 0,
  failed: 0,
  retried: 0,
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  __resetOperatorPostSchedulerForTests()
  m.run.mockResolvedValue(EMPTY)
})

afterEach(() => {
  __resetOperatorPostSchedulerForTests()
  vi.useRealTimers()
})

describe('operator post scheduler', () => {
  it('never overlaps runs: a tick during a run is skipped', async () => {
    const gate = deferred()
    m.run.mockImplementationOnce(async () => {
      await gate.promise
      return EMPTY
    })
    const first = runOperatorPostWorker('tick')
    const second = runOperatorPostWorker('tick')
    expect(second).toBe(first)
    gate.resolve()
    await first
    expect(m.run).toHaveBeenCalledTimes(1)
  })

  it('runs once more after the current run when kicked during it', async () => {
    const gate = deferred()
    m.run.mockImplementationOnce(async () => {
      await gate.promise
      return EMPTY
    })
    const running = runOperatorPostWorker('tick')
    kickOperatorPostWorker()
    kickOperatorPostWorker()
    gate.resolve()
    await running
    expect(m.run).toHaveBeenCalledTimes(2)
  })

  it('keeps ticking after a failed run', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      m.run.mockRejectedValueOnce(new TypeError('boom'))
      await runOperatorPostWorker('tick')
      expect(error).toHaveBeenCalledWith('[operator-post-worker] run_failed', { reason: 'tick', error: 'TypeError' })
      await runOperatorPostWorker('tick')
      expect(m.run).toHaveBeenCalledTimes(2)
    } finally {
      error.mockRestore()
    }
  })

  it('starts one 60 s tick per process, with a first run shortly after boot', async () => {
    vi.useFakeTimers()
    startOperatorPostWorker()
    startOperatorPostWorker()
    expect(m.run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(OPERATOR_POST_FIRST_TICK_MS)
    expect(m.run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(OPERATOR_POST_TICK_MS - OPERATOR_POST_FIRST_TICK_MS)
    expect(m.run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(OPERATOR_POST_TICK_MS)
    expect(m.run).toHaveBeenCalledTimes(3)
  })
})
