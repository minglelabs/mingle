import { describe, expect, it } from 'vitest'
import {
  OPEN_ROOM_PASSWORD_MAX_WRONG,
  OPEN_ROOM_PASSWORD_WINDOW_MS,
  clearOpenRoomPasswordWrong,
  hashOpenRoomPassword,
  noteOpenRoomPasswordWrong,
  openRoomPasswordRetryAfter,
  verifyOpenRoomPassword,
} from './open-room-password'

describe('open room password', () => {
  it('stores a salted hash, not the password', () => {
    const first = hashOpenRoomPassword('seoul1234')
    const second = hashOpenRoomPassword('seoul1234')
    expect(first).not.toContain('seoul1234')
    expect(first).not.toBe(second)
    expect(verifyOpenRoomPassword('seoul1234', first)).toBe(true)
    expect(verifyOpenRoomPassword('seoul1234', second)).toBe(true)
  })

  it('refuses a wrong password, an empty one and a broken hash', () => {
    const stored = hashOpenRoomPassword('seoul1234')
    expect(verifyOpenRoomPassword('seoul12345', stored)).toBe(false)
    expect(verifyOpenRoomPassword('', stored)).toBe(false)
    expect(verifyOpenRoomPassword('seoul1234', null)).toBe(false)
    expect(verifyOpenRoomPassword('seoul1234', 'plain')).toBe(false)
  })

  it('locks a person out of one room after five wrong guesses, for ten minutes', () => {
    const store = new Map<string, number[]>()
    const start = 1_000_000
    for (let i = 0; i < OPEN_ROOM_PASSWORD_MAX_WRONG - 1; i += 1) noteOpenRoomPasswordWrong('u1', 'room', start + i, store)
    expect(openRoomPasswordRetryAfter('u1', 'room', start + 10, store)).toBe(0)
    noteOpenRoomPasswordWrong('u1', 'room', start + 10, store)
    expect(openRoomPasswordRetryAfter('u1', 'room', start + 11, store)).toBeGreaterThan(0)
    // Another person, and another room, are not locked.
    expect(openRoomPasswordRetryAfter('u2', 'room', start + 11, store)).toBe(0)
    expect(openRoomPasswordRetryAfter('u1', 'other', start + 11, store)).toBe(0)
    // The window passes.
    expect(openRoomPasswordRetryAfter('u1', 'room', start + OPEN_ROOM_PASSWORD_WINDOW_MS + 11, store)).toBe(0)
  })

  it('forgets the wrong guesses once the right password is given', () => {
    const store = new Map<string, number[]>()
    for (let i = 0; i < OPEN_ROOM_PASSWORD_MAX_WRONG; i += 1) noteOpenRoomPasswordWrong('u1', 'room', 1000 + i, store)
    clearOpenRoomPasswordWrong('u1', 'room', store)
    expect(openRoomPasswordRetryAfter('u1', 'room', 2000, store)).toBe(0)
  })
})
