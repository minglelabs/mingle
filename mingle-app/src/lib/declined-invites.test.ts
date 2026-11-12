// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readDeclinedInvite, writeDeclinedInvite } from './declined-invites'

describe('declined invites', () => {
  it('remembers the declined game or call per room and kind', () => {
    writeDeclinedInvite('hash-rush', 'room-1', 'game-a')
    writeDeclinedInvite('voice-talk', 'room-1', 'call-b')
    expect(readDeclinedInvite('hash-rush', 'room-1')).toBe('game-a')
    expect(readDeclinedInvite('voice-talk', 'room-1')).toBe('call-b')
    expect(readDeclinedInvite('hash-rush', 'room-2')).toBeNull()
    writeDeclinedInvite('hash-rush', 'room-1', null)
    expect(readDeclinedInvite('hash-rush', 'room-1')).toBeNull()
    expect(readDeclinedInvite('hash-rush', null)).toBeNull()
  })
})
