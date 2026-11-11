import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearRoomPresence,
  getRoomPresence,
  publishRoomPresence,
  resetRoomPresenceForTests,
} from './room-presence'

afterEach(() => resetRoomPresenceForTests())

describe('room presence', () => {
  it('is unknown until the server reports, then holds the reported ids once each', () => {
    expect(getRoomPresence('room-1')).toBeNull()
    publishRoomPresence('room-1', ['b', 'a', 'b', '', 7])
    expect(getRoomPresence('room-1')).toEqual(['a', 'b'])
    expect(getRoomPresence('room-2')).toBeNull()
  })

  it('keeps an empty report apart from unknown', () => {
    publishRoomPresence('room-1', [])
    expect(getRoomPresence('room-1')).toEqual([])
  })

  it('ignores a report that is not a list', () => {
    publishRoomPresence('room-1', 'a')
    expect(getRoomPresence('room-1')).toBeNull()
  })

  it('forgets a room whose connection is gone', () => {
    publishRoomPresence('room-1', ['a'])
    clearRoomPresence('room-1')
    expect(getRoomPresence('room-1')).toBeNull()
  })

  it('keeps the same list object when nothing changed, so readers do not re-render', () => {
    publishRoomPresence('room-1', ['a', 'b'])
    const first = getRoomPresence('room-1')
    publishRoomPresence('room-1', ['b', 'a'])
    expect(getRoomPresence('room-1')).toBe(first)
    vi.restoreAllMocks()
  })
})
