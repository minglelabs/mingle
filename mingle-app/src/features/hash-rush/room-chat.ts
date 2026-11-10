// The chat room's talk inside the Hash Rush game (stage 3). Talk in the game is
// the room's own chat: ordinary room messages, sent with the room's composer
// (history, translation, push and coins as always). The game shows it three
// ways, with no chat of its own:
//   - in the bubble over the speaker's hamster, in this viewer's language
//     (hash-rush embed.js createChatBubbles, ported here);
//   - as the room's own bubbles floating over the map, crisp for five seconds,
//     faint for five more (hash-rush chatbar.js floatLine), and as the whole
//     recent conversation while the composer is up or while it is read back;
//   - the room's composer itself, raised over the game (LivePhoneDemo).
// No DOM here, so it can be tested on its own.

import type { ReactNode } from 'react'
import type { HashRushSeat } from './protocol'

// ---------------------------------------------------------------------------
// The room's messages as the game hears them
//
// Each message is one entry. `text` is what this viewer reads: the translation
// into their language once it has landed, else the original. When the
// translation lands, the same id comes again with new words.
//
// The game hears the last few messages when it starts, then every new one.
// History the room loads later (scrolling up) and messages that were already
// there are never heard.
// ---------------------------------------------------------------------------

export const HASH_RUSH_CHAT_REPLAY_COUNT = 3
// A new message's time can come from the server or another phone. This much
// clock difference still counts as new.
export const HASH_RUSH_CHAT_CLOCK_SKEW_MS = 10_000

export type HashRushChatEntry = {
  id: string
  /** The sender's user id: the same id their Hash Rush ticket carries. '' when the room does not know it. */
  userId: string
  /** What this viewer reads (empty while the message is still being spoken). */
  text: string
  /** The message's place in the room (utteranceOrderTime). */
  orderTimeMs: number
  /** Still being spoken: it is heard once it is a message. */
  pending: boolean
}

export type HashRushChatFeed = {
  startedAtMs: number
  /** In the room when the feed started and not replayed: never heard. */
  oldIds: ReadonlySet<string>
  /** Being spoken when the feed started: heard once it lands. */
  inFlightIds: ReadonlySet<string>
  /** What was last heard of each message. */
  sentText: ReadonlyMap<string, string>
}

export type HashRushChatFeedStep = { feed: HashRushChatFeed, posts: HashRushChatEntry[] }

/** The feed starts: the last few messages are heard, and later only new ones. */
export function startHashRushChatFeed(
  entries: readonly HashRushChatEntry[],
  nowMs: number,
  replayCount = HASH_RUSH_CHAT_REPLAY_COUNT,
): HashRushChatFeedStep {
  const landed = entries.filter((entry) => !entry.pending && entry.text)
  const replay = replayCount > 0 ? landed.slice(-replayCount) : []
  const replayIds = new Set(replay.map((entry) => entry.id))
  return {
    feed: {
      startedAtMs: nowMs,
      oldIds: new Set(landed.filter((entry) => !replayIds.has(entry.id)).map((entry) => entry.id)),
      inFlightIds: new Set(entries.filter((entry) => entry.pending).map((entry) => entry.id)),
      sentText: new Map(replay.map((entry) => [entry.id, entry.text])),
    },
    posts: replay,
  }
}

/** What has not been heard yet: new messages, and new words for ones that have. */
export function advanceHashRushChatFeed(
  feed: HashRushChatFeed,
  entries: readonly HashRushChatEntry[],
  clockSkewMs = HASH_RUSH_CHAT_CLOCK_SKEW_MS,
): HashRushChatFeedStep {
  const posts: HashRushChatEntry[] = []
  let oldIds: Set<string> | null = null
  let sentText: Map<string, string> | null = null
  for (const entry of entries) {
    if (entry.pending || !entry.text) continue
    const sent = (sentText ?? feed.sentText).get(entry.id)
    if (sent === entry.text) continue
    if (sent === undefined) {
      if ((oldIds ?? feed.oldIds).has(entry.id)) continue
      const isNew = feed.inFlightIds.has(entry.id) || entry.orderTimeMs >= feed.startedAtMs - clockSkewMs
      if (!isNew) {
        // Older history coming into the room (scrolling up): never heard.
        oldIds ??= new Set(feed.oldIds)
        oldIds.add(entry.id)
        continue
      }
    }
    sentText ??= new Map(feed.sentText)
    sentText.set(entry.id, entry.text)
    posts.push(entry)
  }
  if (!oldIds && !sentText) return { feed, posts }
  return {
    feed: { ...feed, oldIds: oldIds ?? feed.oldIds, sentText: sentText ?? feed.sentText },
    posts,
  }
}

// ---------------------------------------------------------------------------
// The room's chat, as the room hands it to the game layer
// ---------------------------------------------------------------------------

export type HashRushRoomChat = {
  /** The room's latest messages, oldest first. */
  entries: readonly HashRushChatEntry[]
  /** Draws one room message the room's own way: its bubble, one per message ('collapsed'). */
  renderMessage: (id: string) => ReactNode
  /** The viewer can write here (not a blocked room): the 💬 button shows. */
  canWrite: boolean
  /** The room's composer and quick chat are up over the game. */
  open: boolean
  /** How much of the layer's foot the composer and quick chat cover while up (keyboard included). */
  dockHeightPx: number
  /** The room's voice interpretation is on: what this viewer says becomes messages. */
  interpreting: boolean
  /** Puts the room's composer up over the game (the room picks keyboard or voice). */
  onOpen: () => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Over the hamsters
//
// What somebody says goes up in the bubble over the hamster of the seat their
// mingle user sits in, as the lobby has it from the server (each seat's
// userId comes from its ticket). The bubble has the look and the time to be
// read of the game's own chat (render.js drawBubble, chatbar.js lineLife).
// ---------------------------------------------------------------------------

// A bubble holds as much as a line of the game's own chat could.
export const HASH_RUSH_BUBBLE_MAX = 80
// How many message ids are kept, to tell a translation from a new message.
const HEARD_MAX = 200

/** How long a line stays up over its speaker: longer lines get longer to be read (#136). */
export const lineLife = (text: string) => 6000 + 80 * String(text || '').length

// The first `n` characters of `text`, never half an emoji.
const cut = (text: string, n: number) => (text.length <= n ? text : text.slice(0, /[\uD800-\uDBFF]/.test(text[n - 1]) ? n - 1 : n))

/** The seat a mingle user sits in, or -1: not in a seat, or nobody to look for. */
export function seatOf(seats: readonly HashRushSeat[] | null | undefined, userId: string): number {
  if (!seats || !userId) return -1
  return seats.findIndex((seat) => !!seat && seat.kind === 'remote' && seat.userId === userId)
}

export type HashRushBubble = { id: string, name: string, text: string, until: number }

/**
 * Puts the room's talk in the bubbles over the hamsters (seat -> bubble, the
 * map the renderer draws from). `say(seats, entry, now)` tells which seat's
 * bubble changed (-1: none) and whether it was a new line (`fresh`) or the
 * words of one already up (a translation come in, which only changes its
 * words while its bubble is still up and no newer one has taken its place).
 */
export function createChatBubbles(bubbles: Map<number, HashRushBubble>, life = lineLife) {
  const heard = new Map<string, number>()
  return function say(
    seats: readonly HashRushSeat[] | null | undefined,
    entry: Pick<HashRushChatEntry, 'id' | 'userId' | 'text'>,
    now: number,
  ): { seat: number, fresh: boolean } {
    const said = entry.text.replace(/\s+/g, ' ').trim()
    if (!said) return { seat: -1, fresh: false }
    const words = said.length > HASH_RUSH_BUBBLE_MAX ? `${cut(said, HASH_RUSH_BUBBLE_MAX - 1).trimEnd()}…` : said
    if (heard.has(entry.id)) {
      const seat = heard.get(entry.id)!
      const up = bubbles.get(seat)
      if (!up || up.id !== entry.id || up.until <= now || up.text === words) return { seat: -1, fresh: false }
      bubbles.set(seat, { ...up, text: words, until: now + life(words) })
      return { seat, fresh: false }
    }
    const seat = seatOf(seats, entry.userId)
    heard.set(entry.id, seat)
    if (heard.size > HEARD_MAX) heard.delete(heard.keys().next().value as string)
    if (seat < 0) return { seat: -1, fresh: true }
    bubbles.set(seat, { id: entry.id, name: String(seats?.[seat]?.name || ''), text: words, until: now + life(words) })
    return { seat, fresh: true }
  }
}

// ---------------------------------------------------------------------------
// Floating over the map
//
// A new line floats up crisp for five seconds, three at most at a time, then
// lingers faint as long again: still there to be touched, to read the whole
// conversation back without the keyboard, and soon out of the way of what it
// covers (UIUX-ISSUES #188, #196, #198). New words for a line (its
// translation) give it its crisp seconds again. When the composer goes down,
// or the game comes back into sight, the last three float up again.
// ---------------------------------------------------------------------------

export const FLOAT_CRISP_MS = 5000
export const FLOAT_FAINT_MS = 5000
export const FLOAT_CRISP_MAX = 3
export const FLOAT_MAX = 8

export type FloatingLine = { id: string, text: string, crispUntil: number, goneAt: number }

const crispLine = (id: string, text: string, now: number): FloatingLine => ({
  id,
  text,
  crispUntil: now + FLOAT_CRISP_MS,
  goneAt: now + FLOAT_CRISP_MS + FLOAT_FAINT_MS,
})

/** Lines still up at `now`. */
export function liveLines(lines: readonly FloatingLine[], now: number): FloatingLine[] {
  return lines.filter((line) => line.goneAt > now)
}

/** New lines (and new words for lines up) float crisp; crisp ones past the last three go faint at once. */
export function floatLines(lines: readonly FloatingLine[], posts: readonly Pick<HashRushChatEntry, 'id' | 'text'>[], now: number): FloatingLine[] {
  const next = liveLines(lines, now)
  for (const post of posts) {
    const at = next.findIndex((line) => line.id === post.id)
    if (at >= 0) next[at] = crispLine(post.id, post.text, now)
    else next.push(crispLine(post.id, post.text, now))
  }
  const crisp = next.filter((line) => line.crispUntil > now)
  for (const line of crisp.slice(0, -FLOAT_CRISP_MAX)) {
    const at = next.indexOf(line)
    next[at] = { ...line, crispUntil: now, goneAt: Math.min(line.goneAt, now + FLOAT_FAINT_MS) }
  }
  return next.slice(-FLOAT_MAX)
}

/** The last three lines, crisp again: the composer went down, or the game came back into sight. */
export function refloatLines(entries: readonly HashRushChatEntry[], now: number, count = FLOAT_CRISP_MAX): FloatingLine[] {
  return entries
    .filter((entry) => !entry.pending && entry.text)
    .slice(-count)
    .map((entry) => crispLine(entry.id, entry.text, now))
}

/** The next moment a line goes faint or away (Infinity: nothing will). */
export function nextFloatChange(lines: readonly FloatingLine[], now: number): number {
  let next = Number.POSITIVE_INFINITY
  for (const line of lines) {
    if (line.crispUntil > now) next = Math.min(next, line.crispUntil)
    if (line.goneAt > now) next = Math.min(next, line.goneAt)
  }
  return next
}
