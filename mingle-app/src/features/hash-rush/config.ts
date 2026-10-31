// Where the Hash Rush game server is. One game room per chat room runs there;
// the app joins it over a WebSocket with the room member's entry ticket.

/** A usable ws(s) address, or '' (the same check as the engine's net.js gameServer). */
export function readHashRushServer(raw: string | undefined): string {
  const value = (raw || '').trim()
  return /^wss?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(value) ? value : ''
}

// Next inlines NEXT_PUBLIC_* only where it is written out in full.
export const HASH_RUSH_SERVER = readHashRushServer(process.env.NEXT_PUBLIC_HASH_RUSH_SERVER)

export function isHashRushGameConfigured(): boolean {
  return !!HASH_RUSH_SERVER
}
