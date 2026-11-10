// Where the Hash Rush game server is. One game room per chat room runs there;
// the app joins it over a WebSocket with the room member's entry ticket.

/** A usable ws(s) address, or '' (the same check as the engine's net.js gameServer). */
export function readHashRushServer(raw: string | undefined): string {
  const value = (raw || '').trim()
  return /^wss?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(value) ? value : ''
}

// Next inlines NEXT_PUBLIC_* only where it is written out in full.
export const HASH_RUSH_SERVER = readHashRushServer(process.env.NEXT_PUBLIC_HASH_RUSH_SERVER)

/** The Hash Rush web page, for playing a room's game in a computer browser ('' when not set). */
export const HASH_RUSH_PAGE_URL = /^https?:\/\//i.test((process.env.NEXT_PUBLIC_HASH_RUSH_URL || '').trim())
  ? (process.env.NEXT_PUBLIC_HASH_RUSH_URL || '').trim()
  : ''

/**
 * A link that opens this room's game on a computer: the web page joins the same
 * game-server room with the member's ticket (so it plays as them, for the ticket's
 * 2 hours). Not embedded, so the page keeps its own browser controls.
 */
export function buildHashRushPcLink(args: { pageUrl: string, server: string, room: string, ticket: string, lang?: string }): string {
  const url = new URL(args.pageUrl)
  url.searchParams.set('server', args.server)
  url.searchParams.set('room', args.room)
  url.searchParams.set('ticket', args.ticket)
  if (args.lang) url.searchParams.set('lang', args.lang)
  return url.toString()
}

export function isHashRushGameConfigured(): boolean {
  return !!HASH_RUSH_SERVER
}
