import { describe, expect, it } from 'vitest'
import {
  HASH_RUSH_TICKET_REUSE_MARGIN_MS,
  buildHashRushUrl,
  hashRushCopy,
  hashRushGameOrigin,
  hashRushVisibilityMessage,
  hashRushVoiceMessage,
  isHashRushTicketReusable,
  parseHashRushTicketResponse,
  readHashRushGameMessage,
  resolveHashRushKeyboardInsetPx,
} from './HashRushSheet.logic'

const GAME_ORIGIN = 'https://hashrush.example.com'

describe('hash rush game url', () => {
  it('takes the origin of a usable game URL only', () => {
    expect(hashRushGameOrigin('https://hashrush.example.com/play/?x=1#top')).toBe(GAME_ORIGIN)
    expect(hashRushGameOrigin('http://192.168.0.7:5173/')).toBe('http://192.168.0.7:5173')
    expect(hashRushGameOrigin('')).toBeNull()
    expect(hashRushGameOrigin('not a url')).toBeNull()
    expect(hashRushGameOrigin('javascript:alert(1)')).toBeNull()
    expect(hashRushGameOrigin('data:text/html,hi')).toBeNull()
  })

  it('opens the room with the ticket in embed mode and keeps the page own query', () => {
    const url = new URL(buildHashRushUrl({
      gameUrl: 'https://hashrush.example.com/?build=7',
      server: 'wss://g2.example.com',
      room: 'mingle-abc',
      ticket: 'body.sig',
      name: 'Nam Hyeong Keol',
      lang: 'ko',
    }))
    expect(url.origin).toBe(GAME_ORIGIN)
    expect(url.searchParams.get('build')).toBe('7')
    expect(url.searchParams.get('server')).toBe('wss://g2.example.com')
    expect(url.searchParams.get('room')).toBe('mingle-abc')
    expect(url.searchParams.get('ticket')).toBe('body.sig')
    expect(url.searchParams.get('name')).toBe('Nam Hyeo')
    expect(url.searchParams.get('lang')).toBe('ko')
    expect(url.searchParams.get('embed')).toBe('1')
  })

  it('leaves out an empty name and language', () => {
    const url = new URL(buildHashRushUrl({ gameUrl: GAME_ORIGIN, server: 's', room: 'r', ticket: 't', name: '', lang: '' }))
    expect(url.searchParams.has('name')).toBe(false)
    expect(url.searchParams.has('lang')).toBe(false)
    expect(url.searchParams.get('embed')).toBe('1')
  })
})

describe('hash rush messages', () => {
  const frame = { name: 'game frame window' }
  const otherWindow = { name: 'some other window' }
  const expected = { frame, origin: GAME_ORIGIN }
  const fromGame = (data: unknown, overrides: { source?: unknown, origin?: string } = {}) => ({
    source: 'source' in overrides ? overrides.source : frame,
    origin: overrides.origin ?? GAME_ORIGIN,
    data,
  })

  it('reads every game message in the table', () => {
    expect(readHashRushGameMessage(fromGame({ source: 'hash-rush', type: 'ready', version: 1 }), expected))
      .toEqual({ type: 'ready', version: 1 })
    expect(readHashRushGameMessage(fromGame({ source: 'hash-rush', type: 'keyboard', open: true }), expected))
      .toEqual({ type: 'keyboard', open: true })
    expect(readHashRushGameMessage(fromGame({ source: 'hash-rush', type: 'keyboard', open: false }), expected))
      .toEqual({ type: 'keyboard', open: false })
    for (const phase of ['lobby', 'round', 'results']) {
      expect(readHashRushGameMessage(fromGame({ source: 'hash-rush', type: 'phase', phase }), expected))
        .toEqual({ type: 'phase', phase })
    }
  })

  it('drops messages from another window or another site', () => {
    const ready = { source: 'hash-rush', type: 'ready', version: 1 }
    expect(readHashRushGameMessage(fromGame(ready, { source: otherWindow }), expected)).toBeNull()
    expect(readHashRushGameMessage(fromGame(ready, { source: null }), expected)).toBeNull()
    expect(readHashRushGameMessage(fromGame(ready, { origin: 'https://evil.example.com' }), expected)).toBeNull()
    expect(readHashRushGameMessage(fromGame(ready, { origin: 'http://hashrush.example.com' }), expected)).toBeNull()
    // No frame yet (ticket still loading) or no configured origin: nothing counts.
    expect(readHashRushGameMessage(fromGame(ready, { source: null }), { frame: null, origin: GAME_ORIGIN })).toBeNull()
    expect(readHashRushGameMessage(fromGame(ready), { frame, origin: null })).toBeNull()
  })

  it('drops anything that is not in the table', () => {
    const cases: unknown[] = [
      null,
      'ready',
      JSON.stringify({ source: 'hash-rush', type: 'ready', version: 1 }),
      [{ source: 'hash-rush', type: 'ready', version: 1 }],
      { type: 'ready', version: 1 },
      { source: 'hashchat', type: 'ready', version: 1 },
      { source: 'hash-rush', type: 'quit' },
      { source: 'hash-rush', type: 'ready' },
      { source: 'hash-rush', type: 'ready', version: '1' },
      { source: 'hash-rush', type: 'ready', version: Number.NaN },
      { source: 'hash-rush', type: 'keyboard', open: 'yes' },
      { source: 'hash-rush', type: 'keyboard' },
      { source: 'hash-rush', type: 'phase', phase: 'paused' },
      { source: 'hash-rush', type: 'phase' },
    ]
    for (const data of cases) {
      expect(readHashRushGameMessage(fromGame(data), expected), JSON.stringify(data)).toBeNull()
    }
  })

  it('tells the game exactly the shapes of the table', () => {
    expect(hashRushVisibilityMessage(false)).toEqual({ source: 'hashchat', type: 'visibility', visible: false })
    expect(hashRushVisibilityMessage(true)).toEqual({ source: 'hashchat', type: 'visibility', visible: true })
    expect(hashRushVoiceMessage(true)).toEqual({ source: 'hashchat', type: 'voice', active: true })
    expect(hashRushVoiceMessage(false)).toEqual({ source: 'hashchat', type: 'voice', active: false })
  })
})

describe('hash rush ticket reuse', () => {
  const receivedAt = 1_800_000_000_000
  const twoHours = 2 * 60 * 60

  it('reads the ticket answer and counts its life from when it arrived', () => {
    expect(parseHashRushTicketResponse({ ticket: 'b.s', room: 'mingle-abc', name: 'Mia', exp: 1, expiresIn: twoHours }, receivedAt))
      .toEqual({ ticket: 'b.s', room: 'mingle-abc', name: 'Mia', expiresAtMs: receivedAt + twoHours * 1000 })
    expect(parseHashRushTicketResponse({ ticket: 'b.s', room: 'mingle-abc' }, receivedAt))
      .toEqual({ ticket: 'b.s', room: 'mingle-abc', name: '', expiresAtMs: receivedAt })
  })

  it('refuses an answer without a ticket or a room', () => {
    for (const body of [null, 'b.s', [], {}, { ticket: 'b.s' }, { room: 'mingle-abc' }, { ticket: ' ', room: 'mingle-abc' }, { ticket: 'b.s', room: 7 }]) {
      expect(parseHashRushTicketResponse(body, receivedAt), JSON.stringify(body)).toBeNull()
    }
  })

  it('reuses a ticket while it is good and asks again near its end', () => {
    const grant = parseHashRushTicketResponse({ ticket: 'b.s', room: 'mingle-abc', expiresIn: twoHours }, receivedAt)
    expect(isHashRushTicketReusable(grant, receivedAt)).toBe(true)
    expect(isHashRushTicketReusable(grant, receivedAt + 60 * 60 * 1000)).toBe(true)
    const lastReuseAt = receivedAt + twoHours * 1000 - HASH_RUSH_TICKET_REUSE_MARGIN_MS
    expect(isHashRushTicketReusable(grant, lastReuseAt - 1)).toBe(true)
    expect(isHashRushTicketReusable(grant, lastReuseAt)).toBe(false)
    expect(isHashRushTicketReusable(grant, receivedAt + twoHours * 1000 + 1)).toBe(false)
  })

  it('never reuses a missing ticket or one that came without a lifetime', () => {
    expect(isHashRushTicketReusable(null, receivedAt)).toBe(false)
    expect(isHashRushTicketReusable(undefined, receivedAt)).toBe(false)
    const once = parseHashRushTicketResponse({ ticket: 'b.s', room: 'mingle-abc' }, receivedAt)
    expect(isHashRushTicketReusable(once, receivedAt)).toBe(false)
    expect(isHashRushTicketReusable(once, receivedAt, 0)).toBe(false)
  })
})

describe('hash rush keyboard cut', () => {
  it('is zero while nothing covers the sheet', () => {
    expect(resolveHashRushKeyboardInsetPx({ sheetBottomPx: 812, sheetRenderedHeightPx: 768, sheetLayoutHeightPx: 768, visibleBottomPx: 812 })).toBe(0)
    // Android shrinks the WebView itself: the sheet ends above the keyboard already.
    expect(resolveHashRushKeyboardInsetPx({ sheetBottomPx: 480, sheetRenderedHeightPx: 436, sheetLayoutHeightPx: 436, visibleBottomPx: 480 })).toBe(0)
  })

  it('ends the game area where an iOS keyboard begins', () => {
    expect(resolveHashRushKeyboardInsetPx({ sheetBottomPx: 812, sheetRenderedHeightPx: 768, sheetLayoutHeightPx: 768, visibleBottomPx: 476 })).toBe(336)
  })

  it('converts screen pixels on a scaled canvas', () => {
    // A 375pt phone draws the 400px canvas at 0.9375.
    expect(resolveHashRushKeyboardInsetPx({ sheetBottomPx: 812, sheetRenderedHeightPx: 720, sheetLayoutHeightPx: 768, visibleBottomPx: 512 })).toBe(320)
  })

  it('stays inside the sheet and ignores broken numbers', () => {
    expect(resolveHashRushKeyboardInsetPx({ sheetBottomPx: 812, sheetRenderedHeightPx: 300, sheetLayoutHeightPx: 300, visibleBottomPx: 0 })).toBe(300)
    expect(resolveHashRushKeyboardInsetPx({ sheetBottomPx: Number.NaN, sheetRenderedHeightPx: 768, sheetLayoutHeightPx: 768, visibleBottomPx: 476 })).toBe(0)
    expect(resolveHashRushKeyboardInsetPx({ sheetBottomPx: 812, sheetRenderedHeightPx: 0, sheetLayoutHeightPx: 768, visibleBottomPx: 476 })).toBe(0)
  })
})

describe('hash rush words', () => {
  it('speaks Korean, English and Japanese, and English for every other language', () => {
    expect(hashRushCopy('ko').retry).toBe('다시 시도')
    expect(hashRushCopy('ko-KR').menuLabel).toBe('🌻 Hash Rush 같이 하기')
    expect(hashRushCopy('ja-JP').retry).toBe('再試行')
    expect(hashRushCopy('en').retry).toBe('Try again')
    for (const locale of ['fr', 'zh-CN', 'zh-TW', 'es', 'de', 'vi', 'th', 'id', 'pt-BR', 'ru', 'ar', 'hi', '', 'xx']) {
      expect(hashRushCopy(locale), locale).toEqual(hashRushCopy('en'))
    }
  })

  it('keeps every line short', () => {
    for (const locale of ['ko', 'en', 'ja']) {
      for (const [key, text] of Object.entries(hashRushCopy(locale))) {
        expect(text.trim().length, `${locale}.${key}`).toBeGreaterThan(0)
        expect(text.length, `${locale}.${key}`).toBeLessThanOrEqual(32)
        expect(text, `${locale}.${key}`).not.toContain('\n')
      }
    }
  })
})
