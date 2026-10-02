import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NOTIFICATIONS_READ_EVENT,
  awaitPendingNotificationRead,
  markNotificationsReadOptimistically,
} from './notification-read-sync'

describe('notification-read-sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('announces the read at once so the dot clears before the PATCH ends', () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    markNotificationsReadOptimistically(new Promise(() => {}))
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect((dispatchEvent.mock.calls[0][0] as Event).type).toBe(NOTIFICATIONS_READ_EVENT)
  })

  it('makes a dot read wait for the in-flight mark-read, even when it fails', async () => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
    let reject!: (reason: unknown) => void
    markNotificationsReadOptimistically(new Promise((_, r) => { reject = r }))
    let settled = false
    const waiting = awaitPendingNotificationRead().then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    reject(new Error('offline'))
    await waiting
    expect(settled).toBe(true)
  })

  it('resolves immediately with nothing pending', async () => {
    await expect(awaitPendingNotificationRead()).resolves.toBeUndefined()
  })
})
