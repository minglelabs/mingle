import crypto from 'node:crypto'

// An open room's password: stored as a salted scrypt hash, never as typed.
// Wrong guesses are counted per person and room, in this process (the app
// runs as one instance, the same assumption as server/rate-limit).

const KEY_LENGTH = 32
const PREFIX = 'scrypt1'

export function hashOpenRoomPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(password, salt, KEY_LENGTH)
  return `${PREFIX}$${salt.toString('base64')}$${key.toString('base64')}`
}

export function verifyOpenRoomPassword(password: string, stored: string | null | undefined): boolean {
  if (typeof password !== 'string' || !stored) return false
  const [prefix, saltText, keyText] = stored.split('$')
  if (prefix !== PREFIX || !saltText || !keyText) return false
  try {
    const expected = Buffer.from(keyText, 'base64')
    const actual = crypto.scryptSync(password, Buffer.from(saltText, 'base64'), expected.length)
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export const OPEN_ROOM_PASSWORD_MAX_WRONG = 5
export const OPEN_ROOM_PASSWORD_WINDOW_MS = 10 * 60_000

type WrongStore = Map<string, number[]>
const globalWrong: WrongStore = new Map()

function recent(store: WrongStore, key: string, now: number): number[] {
  return (store.get(key) ?? []).filter((at) => at > now - OPEN_ROOM_PASSWORD_WINDOW_MS)
}

/** Seconds until this person may try this room again; 0 when they may try now. */
export function openRoomPasswordRetryAfter(userId: string, roomId: string, now: number = Date.now(), store: WrongStore = globalWrong): number {
  const hits = recent(store, `${roomId}:${userId}`, now)
  if (hits.length < OPEN_ROOM_PASSWORD_MAX_WRONG) return 0
  return Math.max(1, Math.ceil((hits[0] + OPEN_ROOM_PASSWORD_WINDOW_MS - now) / 1000))
}

export function noteOpenRoomPasswordWrong(userId: string, roomId: string, now: number = Date.now(), store: WrongStore = globalWrong): void {
  const key = `${roomId}:${userId}`
  store.set(key, [...recent(store, key, now), now])
}

export function clearOpenRoomPasswordWrong(userId: string, roomId: string, store: WrongStore = globalWrong): void {
  store.delete(`${roomId}:${userId}`)
}
