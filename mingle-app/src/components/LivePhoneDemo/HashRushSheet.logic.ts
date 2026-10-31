// Plain logic for the Hash Rush sheet (HashRushSheet.tsx): the game URL, the
// message contract with the game page, entry-ticket reuse, the keyboard cut
// and the sheet's words. No React here, so it can be tested on its own.
//
// Message contract (docs/hash-rush-in-app-uiux.md, one table for both sides):
//   game -> app  { source: 'hash-rush', type: 'ready', version: 1 }
//                { source: 'hash-rush', type: 'keyboard', open: boolean }
//                { source: 'hash-rush', type: 'phase', phase: 'lobby' | 'round' | 'results' }
//   app -> game  { source: 'hashchat', type: 'visibility', visible: boolean }
//                { source: 'hashchat', type: 'voice', active: boolean }

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
// Keyboard
//
// A page inside an iframe cannot see the keyboard: its own visualViewport stays
// the iframe's size. While the game says its keyboard is up, the game area ends
// where the keyboard begins, so the game's chat bar can sit on the keyboard as
// it does in a browser. The sheet itself does not move or change size, and the
// game holds its own layout height while someone types.
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
  },
}

export function hashRushCopy(locale: string): HashRushCopy {
  const language = (locale || '').trim().toLowerCase().split(/[-_]/)[0]
  return language === 'ko' || language === 'ja' ? HASH_RUSH_COPY[language] : HASH_RUSH_COPY.en
}
