import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readDeclinedInvite, writeDeclinedInvite } from './declined-invites'

// A plain in-memory localStorage on a stand-in window (the unit tests run in
// node; jsdom is not a dependency of this app).
const store = new Map<string, string>()
const localStorage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => { store.set(key, String(value)) },
  removeItem: (key: string) => { store.delete(key) },
}
const globalWithWindow = globalThis as unknown as { window?: unknown }
const hadWindow = 'window' in globalWithWindow
beforeAll(() => { globalWithWindow.window = { localStorage } })
afterAll(() => { if (!hadWindow) delete globalWithWindow.window })

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
