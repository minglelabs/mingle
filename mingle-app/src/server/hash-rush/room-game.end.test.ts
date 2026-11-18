import { describe, expect, it } from 'vitest'
import { createMemoryHashRushGameStore, endHashRushGame, HASH_RUSH_LIVE_WINDOW_MS, isHashRushGameLive, joinHashRushGame } from '@/server/hash-rush/room-game'

describe('endHashRushGame', () => {
  it('ends the game at once when the last player leaves, and a phone still in it brings it back', async () => {
    const store = createMemoryHashRushGameStore()
    const now = new Date('2026-11-19T00:00:00Z')
    const started = await joinHashRushGame(store, { channelId: 'c1', userId: 'u1', now })
    expect(isHashRushGameLive(await store.read('c1'), now)).toBe(true)

    expect(await endHashRushGame(store, { channelId: 'c1', sessionId: started.sessionId, now })).toBe(true)
    expect(isHashRushGameLive(await store.read('c1'), now)).toBe(false)

    // Someone who was in it after all: their next heartbeat keeps the same game.
    const back = await joinHashRushGame(store, { channelId: 'c1', userId: 'u2', sessionId: started.sessionId, now: new Date(now.getTime() + 5_000) })
    expect(back.sessionId).toBe(started.sessionId)
    expect(back.started).toBe(false)
  })

  it('leaves another game alone', async () => {
    const store = createMemoryHashRushGameStore()
    const now = new Date('2026-11-19T00:00:00Z')
    await joinHashRushGame(store, { channelId: 'c1', userId: 'u1', now })
    expect(await endHashRushGame(store, { channelId: 'c1', sessionId: 'other', now })).toBe(false)
    expect(isHashRushGameLive(await store.read('c1'), new Date(now.getTime() + HASH_RUSH_LIVE_WINDOW_MS - 1_000))).toBe(true)
  })
})
