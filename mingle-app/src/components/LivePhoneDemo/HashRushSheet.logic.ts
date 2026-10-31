// Plain logic for the Hash Rush sheet (HashRushSheet.tsx): the game URL, the
// message contract with the game page, entry-ticket reuse, the room's talk as
// the game hears it, the sheet's place in the room, quick chat, the keyboard
// cut and the sheet's words. No React here, so it can be tested on its own.
//
// Message contract (docs/hash-rush-in-app-uiux.md, one table for both sides):
//   game -> app  { source: 'hash-rush', type: 'ready', version: 1 }
//                { source: 'hash-rush', type: 'keyboard', open: boolean }
//                { source: 'hash-rush', type: 'phase', phase: 'lobby' | 'round' | 'results' }
//   app -> game  { source: 'hashchat', type: 'visibility', visible: boolean }
//                { source: 'hashchat', type: 'voice', active: boolean }
//                { source: 'hashchat', type: 'chat', id, userId, text }

import type { LivePhoneDemoBubbleDisplayMode } from './live-phone-demo.bubble-display'

export const HASH_RUSH_APP_SOURCE = 'hashchat'
export const HASH_RUSH_GAME_SOURCE = 'hash-rush'

export const HASH_RUSH_PHASES = ['lobby', 'round', 'results'] as const
export type HashRushPhase = typeof HASH_RUSH_PHASES[number]

export type HashRushGameMessage =
  | { type: 'ready', version: number }
  | { type: 'keyboard', open: boolean }
  | { type: 'phase', phase: HashRushPhase }

export type HashRushAppMessage =
  | { source: typeof HASH_RUSH_APP_SOURCE, type: 'visibility', visible: boolean }
  | { source: typeof HASH_RUSH_APP_SOURCE, type: 'voice', active: boolean }
  | { source: typeof HASH_RUSH_APP_SOURCE, type: 'chat', id: string, userId: string, text: string }

/** The origin the game page is served from, or null when the URL is not usable. */
export function hashRushGameOrigin(gameUrl: string): string | null {
  try {
    const url = new URL(gameUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

export function buildHashRushUrl(args: { gameUrl: string, server: string, room: string, ticket: string, name: string, lang: string }): string {
  const url = new URL(args.gameUrl)
  url.searchParams.set('server', args.server)
  url.searchParams.set('room', args.room)
  url.searchParams.set('ticket', args.ticket)
  if (args.name) url.searchParams.set('name', args.name.slice(0, 8))
  if (args.lang) url.searchParams.set('lang', args.lang)
  url.searchParams.set('embed', '1')
  return url.toString()
}

/**
 * What the game page said, or null. Only the iframe this sheet holds, from the
 * game's origin, saying something in the table counts; everything else is
 * dropped (other frames, other sites, other shapes).
 */
export function readHashRushGameMessage(
  event: { source: unknown, origin: string, data: unknown },
  expected: { frame: unknown, origin: string | null },
): HashRushGameMessage | null {
  if (!expected.frame || event.source !== expected.frame) return null
  if (!expected.origin || event.origin !== expected.origin) return null
  const data = event.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const message = data as Record<string, unknown>
  if (message.source !== HASH_RUSH_GAME_SOURCE) return null
  if (message.type === 'ready') {
    return typeof message.version === 'number' && Number.isFinite(message.version)
      ? { type: 'ready', version: message.version }
      : null
  }
  if (message.type === 'keyboard') {
    return typeof message.open === 'boolean' ? { type: 'keyboard', open: message.open } : null
  }
  if (message.type === 'phase') {
    return (HASH_RUSH_PHASES as readonly unknown[]).includes(message.phase)
      ? { type: 'phase', phase: message.phase as HashRushPhase }
      : null
  }
  return null
}

export function hashRushVisibilityMessage(visible: boolean): HashRushAppMessage {
  return { source: HASH_RUSH_APP_SOURCE, type: 'visibility', visible }
}

export function hashRushVoiceMessage(active: boolean): HashRushAppMessage {
  return { source: HASH_RUSH_APP_SOURCE, type: 'voice', active }
}

export function hashRushChatMessage(entry: Pick<HashRushChatEntry, 'id' | 'userId' | 'text'>): HashRushAppMessage {
  return { source: HASH_RUSH_APP_SOURCE, type: 'chat', id: entry.id, userId: entry.userId, text: entry.text }
}

// ---------------------------------------------------------------------------
// The room's talk over the hamsters
//
// Talk in the game is the room's own chat (normal room messages: history,
// translation, push and coins as always). Each message goes to the game as
// `chat` and the game shows it over the sender's hamster. `text` is what this
// viewer reads: the translation into their language once it has landed, else
// the original. When the translation lands the same id goes again, and the
// game only swaps the words.
//
// The game hears the last few messages when it says `ready`, then every new
// one while its page is up. History the room loads later (scrolling up) and
// messages that were already there are never sent.
// ---------------------------------------------------------------------------

export const HASH_RUSH_CHAT_REPLAY_COUNT = 3
// A new message's time can come from the server or another phone. This much
// clock difference still counts as new.
export const HASH_RUSH_CHAT_CLOCK_SKEW_MS = 10_000

export type HashRushChatEntry = {
  id: string
  /** The sender's user id: the same id their Hash Rush ticket carries. */
  userId: string
  /** What this viewer reads (empty while the message is still being spoken). */
  text: string
  /** The message's place in the room (utteranceOrderTime). */
  orderTimeMs: number
  /** Still being spoken: it goes to the game once it is a message. */
  pending: boolean
}

export type HashRushChatFeed = {
  startedAtMs: number
  /** In the room when the game said `ready` and not replayed: never sent. */
  oldIds: ReadonlySet<string>
  /** Being spoken when the game said `ready`: sent once it lands. */
  inFlightIds: ReadonlySet<string>
  /** What the game last heard for each message it got. */
  sentText: ReadonlyMap<string, string>
}

export type HashRushChatFeedStep = { feed: HashRushChatFeed, posts: HashRushChatEntry[] }

/** The game said `ready`: it hears the last few messages, and later only new ones. */
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

/** What the game has not heard yet: new messages, and new words for ones it has. */
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
        // Older history coming into the room (scrolling up): never sent.
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
// The sheet in the room
//
// The sheet covers the room from under its top bar down to a strip of the
// room's latest messages, the quick chat row and the room's own composer,
// which all stay usable below it. The room keeps an empty slot where the sheet
// goes; the sheet takes the slot's place and height. While a keyboard is up
// (the composer is focused, or the page's visual viewport is cut), the slot
// shrinks but the sheet keeps its place and height: only the composer and the
// strip on top of it rise, over the foot of the game.
// ---------------------------------------------------------------------------

/** The room's latest messages under the sheet: about two to three lines of talk. */
export const HASH_RUSH_CHAT_STRIP_HEIGHT_PX = 100
/** A changed slot counts once it has stopped changing this long (a keyboard sliding away). */
export const HASH_RUSH_SHEET_FRAME_SETTLE_MS = 350

export type HashRushSheetFrame = {
  /** From the top of the room (the sheet's positioned parent), in its CSS pixels. */
  topPx: number
  heightPx: number
  /** The room's own height, for how far down the lowered sheet goes. */
  rootHeightPx: number
}

/**
 * The sheet's next place. The first good measure always counts; after that a
 * held frame (a keyboard is up) stays as it is, and changes under a pixel are
 * ignored. Broken measures (the slot not in the room yet) keep what there is.
 */
export function resolveHashRushSheetFrame(
  current: HashRushSheetFrame | null,
  measured: HashRushSheetFrame | null,
  held: boolean,
): HashRushSheetFrame | null {
  if (!measured) return current
  const { topPx, heightPx, rootHeightPx } = measured
  if (![topPx, heightPx, rootHeightPx].every(Number.isFinite) || heightPx <= 0 || rootHeightPx <= 0) return current
  const next = { topPx: Math.max(0, Math.round(topPx)), heightPx: Math.round(heightPx), rootHeightPx: Math.round(rootHeightPx) }
  if (!current) return next
  if (held) return current
  const same = Math.abs(current.topPx - next.topPx) < 1
    && Math.abs(current.heightPx - next.heightPx) < 1
    && Math.abs(current.rootHeightPx - next.rootHeightPx) < 1
  return same ? current : next
}

const HASH_RUSH_SHEET_HIDDEN_MARGIN_PX = 40
const HASH_RUSH_SHEET_HIDDEN_FALLBACK_PX = 2000

/** How far down the lowered sheet goes: past the room's bottom, shadow and all. */
export function resolveHashRushSheetHiddenOffsetPx(frame: HashRushSheetFrame | null): number {
  if (!frame) return HASH_RUSH_SHEET_HIDDEN_FALLBACK_PX
  return Math.max(frame.rootHeightPx, frame.topPx + frame.heightPx) + HASH_RUSH_SHEET_HIDDEN_MARGIN_PX
}

/**
 * While the sheet is up the room's bubbles read as one bubble each
 * ('collapsed', "하나의 말풍선으로 표시"), so the strip under the game holds more
 * talk. Only what is drawn changes; the saved setting stays as it is.
 */
export function resolveHashRushBubbleDisplayMode(
  saved: LivePhoneDemoBubbleDisplayMode,
  sheetOpen: boolean,
): LivePhoneDemoBubbleDisplayMode {
  return sheetOpen ? 'collapsed' : saved
}

// ---------------------------------------------------------------------------
// Quick chat: the game's own ready-made lines (hash-rush src/client/i18n.js,
// `quickChat`), in the game's languages. A tap sends one as a normal room
// message, translated like any other.
// ---------------------------------------------------------------------------

export const HASH_RUSH_QUICK_CHAT = {
  // The game's own list, minus its swear words: these are app-wide default chips.
  ko: ['ㄱㄱ', '잠만', 'ㅋㅋㅋ', 'ㅇㅋ', 'ㄴㄴ', 'ㅎㅇ', '굳굳 👍', 'ㄲㅂ', 'ㅈㅅ', 'ㄷㄷ', '한 판 더?', '팀 바꾸자', 'ㅂㅂ'],
  en: ['gogo', 'wait', 'lol', 'ok', 'nope', 'hey', 'gj 👍', 'unlucky', 'my bad', 'omg', 'Again?', 'swap teams?', 'bye'],
  ja: ['いこいこ', 'ちょい待ち', 'www', 'おけ', 'むり', 'ちわ', 'ナイス 👍', 'おしい', 'すまん', 'やば', 'もう一回?', 'チーム替えよう', 'またね'],
  'zh-Hans': ['冲冲冲', '等下', '哈哈哈', '好', '不要', '嗨', '666 👍', '可惜', '我的锅', '天哪', '再来?', '换队吧', '拜拜'],
  'zh-Hant': ['衝衝衝', '等一下', '哈哈哈', '好', '不要', '嗨', '讚啦 👍', '可惜', '歹勢', '天啊', '再來?', '換隊吧', '掰掰'],
} as const satisfies Record<string, readonly string[]>

/** The game's own pick (its pickLanguage): Korean, Japanese, Chinese by script, else English. */
export function hashRushQuickChat(locale: string): readonly string[] {
  const tag = (locale || '').trim().toLowerCase().replace(/_/g, '-')
  if (tag.startsWith('ko')) return HASH_RUSH_QUICK_CHAT.ko
  if (tag.startsWith('ja')) return HASH_RUSH_QUICK_CHAT.ja
  if (tag.startsWith('zh')) {
    return !tag.includes('hans') && /hant|-(tw|hk|mo)\b/.test(tag)
      ? HASH_RUSH_QUICK_CHAT['zh-Hant']
      : HASH_RUSH_QUICK_CHAT['zh-Hans']
  }
  return HASH_RUSH_QUICK_CHAT.en
}

// ---------------------------------------------------------------------------
// Entry tickets
//
// The server's ticket lasts 2 hours (src/server/hash-rush/ticket.ts) and the
// game page reconnects with the same ticket after a dropped line. A ticket is
// reused when the game is opened again in the same room until shortly before
// it runs out; a ticket that is almost spent would stop the next reconnect.
// ---------------------------------------------------------------------------

export const HASH_RUSH_TICKET_REUSE_MARGIN_MS = 10 * 60 * 1000

export type HashRushTicketGrant = {
  ticket: string
  room: string
  name: string
  /** On this device's clock: when the ticket was received plus its lifetime. */
  expiresAtMs: number
}

/**
 * Reads the ticket API's answer. `expiresIn` (seconds) is counted from when the
 * answer arrived, so a phone clock that is off does not matter. An answer
 * without it is used once and not kept for reuse.
 */
export function parseHashRushTicketResponse(body: unknown, receivedAtMs: number): HashRushTicketGrant | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const { ticket, room, name, expiresIn } = body as Record<string, unknown>
  if (typeof ticket !== 'string' || !ticket.trim()) return null
  if (typeof room !== 'string' || !room.trim()) return null
  const lifetimeSec = typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 0
  return {
    ticket,
    room,
    name: typeof name === 'string' ? name : '',
    expiresAtMs: receivedAtMs + lifetimeSec * 1000,
  }
}

export function isHashRushTicketReusable(
  grant: HashRushTicketGrant | null | undefined,
  nowMs: number,
  marginMs = HASH_RUSH_TICKET_REUSE_MARGIN_MS,
): grant is HashRushTicketGrant {
  return !!grant && grant.expiresAtMs - nowMs > marginMs
}

// ---------------------------------------------------------------------------
// The game's own keyboard
//
// Talk goes through the room's composer now, but the contract keeps `keyboard`
// for any text box the game still shows. A page inside an iframe cannot see
// the keyboard: its own visualViewport stays the iframe's size. While the game
// says its keyboard is up, the game area ends where the keyboard begins, so
// the game's box can sit on the keyboard as it does in a browser. The sheet
// itself does not move or change size, and the game holds its own layout
// height while someone types.
// ---------------------------------------------------------------------------

/**
 * How much of the sheet's foot the keyboard covers, in the sheet's own CSS
 * pixels (the app canvas can be scaled, so screen pixels are converted).
 */
export function resolveHashRushKeyboardInsetPx(input: {
  sheetBottomPx: number
  sheetRenderedHeightPx: number
  sheetLayoutHeightPx: number
  visibleBottomPx: number
}): number {
  const { sheetBottomPx, sheetRenderedHeightPx, sheetLayoutHeightPx, visibleBottomPx } = input
  if (![sheetBottomPx, sheetRenderedHeightPx, sheetLayoutHeightPx, visibleBottomPx].every(Number.isFinite)) return 0
  if (sheetRenderedHeightPx <= 0 || sheetLayoutHeightPx <= 0) return 0
  const coveredScreenPx = sheetBottomPx - visibleBottomPx
  if (coveredScreenPx <= 0) return 0
  const scale = sheetRenderedHeightPx / sheetLayoutHeightPx
  return Math.min(sheetLayoutHeightPx, Math.round(coveredScreenPx / scale))
}

// ---------------------------------------------------------------------------
// Words: short, at most two lines. Korean, English and Japanese; every other
// app language reads the English.
// ---------------------------------------------------------------------------

export type HashRushCopy = {
  menuLabel: string
  title: string
  backToChat: string
  voiceOn: string
  opening: string
  ticketFailed: string
  connectFailed: string
  retry: string
  quickChat: string
}

const HASH_RUSH_COPY: Record<'ko' | 'en' | 'ja', HashRushCopy> = {
  ko: {
    menuLabel: '🌻 Hash Rush 같이 하기',
    title: '🌻 Hash Rush',
    backToChat: '채팅으로',
    voiceOn: '보이스톡 중',
    opening: '게임을 여는 중',
    ticketFailed: '게임에 들어가지 못했어요',
    connectFailed: '게임 서버에 연결하지 못했어요',
    retry: '다시 시도',
    quickChat: '빠른 채팅',
  },
  en: {
    menuLabel: '🌻 Play Hash Rush together',
    title: '🌻 Hash Rush',
    backToChat: 'Back to chat',
    voiceOn: 'In a voice talk',
    opening: 'Opening the game',
    ticketFailed: "Couldn't get into the game",
    connectFailed: "Couldn't reach the game server",
    retry: 'Try again',
    quickChat: 'Quick chat',
  },
  ja: {
    menuLabel: '🌻 Hash Rushを一緒に遊ぶ',
    title: '🌻 Hash Rush',
    backToChat: 'チャットに戻る',
    voiceOn: 'ボイストーク中',
    opening: 'ゲームを開いています',
    ticketFailed: 'ゲームに入れませんでした',
    connectFailed: 'ゲームサーバーにつながりませんでした',
    retry: '再試行',
    quickChat: 'クイックチャット',
  },
}

export function hashRushCopy(locale: string): HashRushCopy {
  const language = (locale || '').trim().toLowerCase().split(/[-_]/)[0]
  return language === 'ko' || language === 'ja' ? HASH_RUSH_COPY[language] : HASH_RUSH_COPY.en
}
