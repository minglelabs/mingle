import { describe, expect, it } from 'vitest'
import {
  buildHashRushMessageClientId,
  normalizeHashRushMessage,
  parseHashRushRoomGame,
  resolveHashRushMessageState,
  shouldOfferHashRushInvite,
} from './hash-rush-message'

describe('hash rush room message', () => {
  it('reads the announcement and names one message per game', () => {
    expect(normalizeHashRushMessage({ sessionId: ' s1 ' })).toEqual({ sessionId: 's1' })
    expect(normalizeHashRushMessage({ sessionId: '' })).toBeNull()
    expect(normalizeHashRushMessage(null)).toBeNull()
    expect(buildHashRushMessageClientId('s1')).toBe('hash-rush-s1')
  })

  it('joins while its game runs, says joined while playing, ended after', () => {
    const message = { sessionId: 's1' }
    expect(resolveHashRushMessageState({ message, liveSessionId: 's1', joined: false })).toBe('joinable')
    expect(resolveHashRushMessageState({ message, liveSessionId: 's1', joined: true })).toBe('joined')
    expect(resolveHashRushMessageState({ message, liveSessionId: 's2', joined: false })).toBe('ended')
    expect(resolveHashRushMessageState({ message, liveSessionId: null, joined: false })).toBe('ended')
  })

  it('offers someone else\'s game once: never the starter\'s own, a declined or quit one, or while playing', () => {
    const game = parseHashRushRoomGame({ sessionId: 's1', startedBy: { userId: 'a', name: 'pp74' } })
    expect(game).toEqual({ sessionId: 's1', startedBy: { userId: 'a', name: 'pp74' } })
    expect(shouldOfferHashRushInvite({ game, playing: false, viewerUserId: 'b', declinedSessionId: null })).toBe(true)
    expect(shouldOfferHashRushInvite({ game, playing: false, viewerUserId: 'a', declinedSessionId: null })).toBe(false)
    expect(shouldOfferHashRushInvite({ game, playing: false, viewerUserId: 'b', declinedSessionId: 's1' })).toBe(false)
    expect(shouldOfferHashRushInvite({ game, playing: true, viewerUserId: 'b', declinedSessionId: null })).toBe(false)
    expect(shouldOfferHashRushInvite({ game: null, playing: false, viewerUserId: 'b', declinedSessionId: null })).toBe(false)
  })
})
