import { describe, expect, it } from 'vitest'
import { sameHashRushRoomGame } from './HashRushRoomPrompts'

describe('sameHashRushRoomGame', () => {
  it('treats a poll that says the same as no change (no room re-render under the game)', () => {
    const a = { sessionId: 's1', startedBy: { userId: 'u1', name: 'Mia' } }
    expect(sameHashRushRoomGame(a, { sessionId: 's1', startedBy: { userId: 'u1', name: 'Mia' } })).toBe(true)
    expect(sameHashRushRoomGame(a, { sessionId: 's2', startedBy: { userId: 'u1', name: 'Mia' } })).toBe(false)
    expect(sameHashRushRoomGame(a, { sessionId: 's1', startedBy: null })).toBe(false)
    expect(sameHashRushRoomGame(null, null)).toBe(true)
    expect(sameHashRushRoomGame(a, null)).toBe(false)
  })
})
