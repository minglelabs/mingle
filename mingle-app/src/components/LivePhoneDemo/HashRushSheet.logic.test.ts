import { describe, expect, it } from 'vitest'
import {
  HASH_RUSH_CHAT_CLOCK_SKEW_MS,
  HASH_RUSH_CHAT_REPLAY_COUNT,
  HASH_RUSH_QUICK_CHAT,
  HASH_RUSH_TICKET_REUSE_MARGIN_MS,
  advanceHashRushChatFeed,
  buildHashRushUrl,
  hashRushChatMessage,
  hashRushCopy,
  hashRushGameOrigin,
  hashRushQuickChat,
  hashRushVisibilityMessage,
  hashRushVoiceMessage,
  isHashRushTicketReusable,
  parseHashRushTicketResponse,
  readHashRushGameMessage,
  resolveHashRushBubbleDisplayMode,
  resolveHashRushKeyboardInsetPx,
  resolveHashRushSheetFrame,
  resolveHashRushSheetHiddenOffsetPx,
  startHashRushChatFeed,
  type HashRushChatEntry,
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
    expect(hashRushChatMessage({ id: 'm1', userId: 'user-a', text: 'ㄱㄱ' }))
      .toEqual({ source: 'hashchat', type: 'chat', id: 'm1', userId: 'user-a', text: 'ㄱㄱ' })
  })

  it('puts only id, userId and text in a chat message', () => {
    const entry: HashRushChatEntry = { id: 'm1', userId: 'user-a', text: 'hi', orderTimeMs: 5, pending: false }
    expect(Object.keys(hashRushChatMessage(entry)).sort()).toEqual(['id', 'source', 'text', 'type', 'userId'])
  })
})

describe('hash rush room talk feed', () => {
  const startedAt = 1_800_000_000_000
  const entry = (id: string, text: string, orderTimeMs: number, extra: Partial<HashRushChatEntry> = {}): HashRushChatEntry => ({
    id,
    userId: `user-${id}`,
    text,
    orderTimeMs,
    pending: false,
    ...extra,
  })
  const ids = (posts: readonly HashRushChatEntry[]) => posts.map((post) => `${post.id}:${post.text}`)

  it('replays the last few messages when the game says ready', () => {
    const history = [1, 2, 3, 4, 5].map((n) => entry(`m${n}`, `line ${n}`, startedAt - n * 60_000))
    const { feed, posts } = startHashRushChatFeed(history, startedAt)
    expect(HASH_RUSH_CHAT_REPLAY_COUNT).toBe(3)
    expect(ids(posts)).toEqual(['m3:line 3', 'm4:line 4', 'm5:line 5'])
    expect([...feed.oldIds].sort()).toEqual(['m1', 'm2'])
    expect([...feed.sentText.entries()]).toEqual([['m3', 'line 3'], ['m4', 'line 4'], ['m5', 'line 5']])
  })

  it('never replays a message still being spoken, and sends it once it lands', () => {
    const { feed, posts } = startHashRushChatFeed([
      entry('m1', 'hello', startedAt - 5_000),
      entry('live', '', startedAt - 60_000, { pending: true }),
    ], startedAt)
    expect(ids(posts)).toEqual(['m1:hello'])
    expect(advanceHashRushChatFeed(feed, [entry('live', '', startedAt - 60_000, { pending: true })]).posts).toEqual([])
    // A long turn started well before `ready`, but it was in flight then.
    expect(ids(advanceHashRushChatFeed(feed, [entry('live', 'done talking', startedAt - 60_000)]).posts))
      .toEqual(['live:done talking'])
  })

  it('sends each new message once, and again with the same id when its translation lands', () => {
    // No replay here: m1 is plain history the game never hears.
    let { feed } = startHashRushChatFeed([entry('m1', 'old', startedAt - 120_000)], startedAt, 0)
    const step1 = advanceHashRushChatFeed(feed, [entry('m1', 'old', startedAt - 120_000), entry('m2', '안녕', startedAt + 1_000)])
    expect(ids(step1.posts)).toEqual(['m2:안녕'])
    feed = step1.feed
    const unchanged = advanceHashRushChatFeed(feed, [entry('m1', 'old', startedAt - 120_000), entry('m2', '안녕', startedAt + 1_000)])
    expect(unchanged.posts).toEqual([])
    expect(unchanged.feed).toBe(feed)
    const translated = advanceHashRushChatFeed(feed, [entry('m1', 'old (translated)', startedAt - 120_000), entry('m2', 'Hi', startedAt + 1_000)])
    expect(ids(translated.posts)).toEqual(['m2:Hi'])
    expect(translated.feed.sentText.get('m2')).toBe('Hi')
  })

  it('gives replayed messages their translation too', () => {
    const { feed } = startHashRushChatFeed([entry('m1', '가자', startedAt - 2_000)], startedAt)
    expect(ids(advanceHashRushChatFeed(feed, [entry('m1', "Let's go", startedAt - 2_000)]).posts)).toEqual(["m1:Let's go"])
  })

  it('never sends older history the room loads later', () => {
    const { feed } = startHashRushChatFeed([entry('m5', 'latest', startedAt - 30_000)], startedAt)
    const older = [entry('m1', 'a', startedAt - 3_600_000), entry('m2', 'b', startedAt - 3_500_000)]
    const step = advanceHashRushChatFeed(feed, [...older, entry('m5', 'latest', startedAt - 30_000)])
    expect(step.posts).toEqual([])
    expect(step.feed.oldIds.has('m1')).toBe(true)
    // Once filed as history, a translation for it does not send it either.
    expect(advanceHashRushChatFeed(step.feed, [entry('m1', 'a (translated)', startedAt - 3_600_000)]).posts).toEqual([])
  })

  it('allows some clock difference for a message that is new', () => {
    const { feed } = startHashRushChatFeed([], startedAt)
    const justInside = entry('m1', 'hey', startedAt - HASH_RUSH_CHAT_CLOCK_SKEW_MS)
    const tooOld = entry('m0', 'before', startedAt - HASH_RUSH_CHAT_CLOCK_SKEW_MS - 1)
    expect(ids(advanceHashRushChatFeed(feed, [tooOld, justInside]).posts)).toEqual(['m1:hey'])
  })

  it('skips entries with nothing to say', () => {
    const { feed, posts } = startHashRushChatFeed([entry('m1', '', startedAt - 1_000)], startedAt)
    expect(posts).toEqual([])
    expect(advanceHashRushChatFeed(feed, [entry('m2', '', startedAt + 1_000)]).posts).toEqual([])
  })

  it('starts over for a new page: the last few again', () => {
    const talk = [entry('m1', 'one', startedAt + 1_000), entry('m2', 'two', startedAt + 2_000)]
    const first = startHashRushChatFeed([], startedAt)
    expect(ids(advanceHashRushChatFeed(first.feed, talk).posts)).toEqual(['m1:one', 'm2:two'])
    expect(ids(startHashRushChatFeed(talk, startedAt + 60_000).posts)).toEqual(['m1:one', 'm2:two'])
  })
})

describe('hash rush sheet place', () => {
  const frame = { topPx: 98, heightPx: 520, rootHeightPx: 866 }

  it('takes the first good measure, rounded', () => {
    expect(resolveHashRushSheetFrame(null, { topPx: 97.6, heightPx: 520.4, rootHeightPx: 866 }, false))
      .toEqual({ topPx: 98, heightPx: 520, rootHeightPx: 866 })
    // Even with a keyboard up: there is no other place to keep.
    expect(resolveHashRushSheetFrame(null, frame, true)).toEqual(frame)
  })

  it('keeps its place and height while a keyboard is up', () => {
    const shrunk = { topPx: 98, heightPx: 184, rootHeightPx: 866 }
    expect(resolveHashRushSheetFrame(frame, shrunk, true)).toBe(frame)
    expect(resolveHashRushSheetFrame(frame, shrunk, false)).toEqual(shrunk)
  })

  it('ignores sub-pixel changes and broken measures', () => {
    expect(resolveHashRushSheetFrame(frame, { topPx: 98.3, heightPx: 520.2, rootHeightPx: 866 }, false)).toBe(frame)
    expect(resolveHashRushSheetFrame(frame, null, false)).toBe(frame)
    expect(resolveHashRushSheetFrame(frame, { topPx: Number.NaN, heightPx: 520, rootHeightPx: 866 }, false)).toBe(frame)
    expect(resolveHashRushSheetFrame(frame, { topPx: 98, heightPx: 0, rootHeightPx: 866 }, false)).toBe(frame)
    expect(resolveHashRushSheetFrame(null, { topPx: 98, heightPx: 520, rootHeightPx: 0 }, false)).toBeNull()
  })

  it('goes all the way past the room bottom when lowered', () => {
    expect(resolveHashRushSheetHiddenOffsetPx(frame)).toBeGreaterThanOrEqual(frame.rootHeightPx)
    expect(frame.topPx + resolveHashRushSheetHiddenOffsetPx(frame)).toBeGreaterThan(frame.rootHeightPx)
    // A sheet taller than what is left of the room still clears it.
    expect(resolveHashRushSheetHiddenOffsetPx({ topPx: 98, heightPx: 900, rootHeightPx: 866 })).toBeGreaterThan(900)
    expect(resolveHashRushSheetHiddenOffsetPx(null)).toBeGreaterThan(1000)
  })
})

describe('hash rush bubbles while up', () => {
  it('shows one bubble per message only while the sheet is up', () => {
    expect(resolveHashRushBubbleDisplayMode('expanded', true)).toBe('collapsed')
    expect(resolveHashRushBubbleDisplayMode('collapsed', true)).toBe('collapsed')
    expect(resolveHashRushBubbleDisplayMode('expanded', false)).toBe('expanded')
    expect(resolveHashRushBubbleDisplayMode('collapsed', false)).toBe('collapsed')
  })
})

describe('hash rush quick chat', () => {
  it('uses the game own 14 lines', () => {
    expect(hashRushQuickChat('ko')).toEqual([
      'ㄱㄱ', '잠만', 'ㅋㅋㅋ', 'ㅇㅋ', 'ㄴㄴ', 'ㅎㅇ', '굳굳 👍', 'ㄲㅂ', 'ㅈㅅ', 'ㄷㄷ', 'ㅅㅂ', '한 판 더?', '팀 바꾸자', 'ㅂㅂ',
    ])
    for (const [language, lines] of Object.entries(HASH_RUSH_QUICK_CHAT)) {
      expect(lines, language).toHaveLength(14)
      expect(new Set(lines).size, language).toBe(14)
      for (const line of lines) expect(line.trim(), language).toBe(line)
    }
  })

  it('picks the language the way the game does', () => {
    expect(hashRushQuickChat('ko-KR')).toBe(HASH_RUSH_QUICK_CHAT.ko)
    expect(hashRushQuickChat('ja')).toBe(HASH_RUSH_QUICK_CHAT.ja)
    expect(hashRushQuickChat('zh-CN')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hans'])
    expect(hashRushQuickChat('zh')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hans'])
    expect(hashRushQuickChat('zh-TW')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hant'])
    expect(hashRushQuickChat('zh_HK')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hant'])
    expect(hashRushQuickChat('zh-Hant-TW')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hant'])
    expect(hashRushQuickChat('zh-Hans-TW')).toBe(HASH_RUSH_QUICK_CHAT['zh-Hans'])
    for (const locale of ['en', 'en-US', 'fr', 'es', 'vi', 'th', '', 'xx']) {
      expect(hashRushQuickChat(locale), locale).toBe(HASH_RUSH_QUICK_CHAT.en)
    }
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
