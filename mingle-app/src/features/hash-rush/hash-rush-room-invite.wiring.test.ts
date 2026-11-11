import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const liveDemo = read('../../components/LivePhoneDemo/LivePhoneDemo.tsx')
const prompts = read('../../components/LivePhoneDemo/HashRushRoomPrompts.tsx')
const bubble = read('../../components/LivePhoneDemo/ChatBubble.tsx')
const layer = read('./HashRushRoomLayer.tsx')
const game = read('./HashRushGame.tsx')
const controller = read('../../server/api/controllers/shared/hash-rush-controller.ts')

describe('hash rush started from the room, like a voice talk', () => {
  it('the first join leaves "<name> started Hash Rush" in the room, with a Join button', () => {
    expect(controller).toContain('metadata: { hashRush: { sessionId: input.sessionId } }')
    expect(controller).toContain('if (result.started) {')
    expect(bubble).toContain('<HashRushStartedBubble')
    expect(liveDemo).toContain('<HashRushRoomContext.Provider value={hashRushRoom}>')
  })

  it('asks before starting or joining, offers someone else\'s game in a card, hides the ad banner meanwhile', () => {
    expect(prompts).toContain('data-qa="hash-rush-start-confirm"')
    expect(prompts).toContain('data-qa="hash-rush-incoming-decline"')
    expect(prompts).toContain('useNativeBannerSuppression(dialogOpen)')
    expect(liveDemo).toContain('onDecline={() => setDeclinedHashRushSessionId(hashRushLiveSessionId)}')
  })

  it('tells the server every 15 s while playing, staying in its own game', () => {
    expect(prompts).toContain('postHashRushRoomJoin(conversationId, gameRef.current?.sessionId ?? null)')
    expect(prompts).toContain('HASH_RUSH_CLIENT_HEARTBEAT_MS = 15_000')
  })

  it('has a Quit next to the back pill that asks, then ends the game for this phone', () => {
    expect(game).toContain('data-qa="hash-rush-game-quit"')
    expect(layer).toContain('onQuit={onQuit ? () => setConfirmQuit(true) : undefined}')
    expect(layer).toContain('onClick={() => { setConfirmQuit(false); onQuit() }}')
    const quit = liveDemo.slice(liveDemo.indexOf('const quitHashRushGame = useCallback(() => {'))
    expect(quit.slice(0, 400)).toContain('setHashRushGameActive(false)')
    expect(quit.slice(0, 400)).toContain('setDeclinedHashRushSessionId(hashRushLiveSessionId)')
    expect(liveDemo).toContain('onQuit={quitHashRushGame}')
  })
})
