import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildHashRushPcLink } from '@/features/hash-rush/config'
import { liveRoomsCopy } from '@/i18n/live-rooms-copy'
import { openRoomsCopy } from '@/i18n/open-rooms-copy'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n/config'
import {
  normalizeOpenRoomTitle,
  normalizeOpenRoomTopic,
  openRoomStatus,
  parseOpenRooms,
  readOpenRoomPassword,
  sortOpenRooms,
} from '@/lib/open-room'
import { isChatListConversation } from '@/components/conversation-list.logic'
import { openRoomJoinErrorText } from './open-rooms'

const roomsSource = readFileSync(new URL('./open-rooms.tsx', import.meta.url), 'utf8')
const searchSource = readFileSync(new URL('./unified-search.tsx', import.meta.url), 'utf8')
const serverSource = readFileSync(new URL('../../lib/app-conversations.ts', import.meta.url), 'utf8')
const liveDemoSource = readFileSync(new URL('../LivePhoneDemo/LivePhoneDemo.tsx', import.meta.url), 'utf8')

const room = (id: string, patch: Partial<ReturnType<typeof parseOpenRooms>[number]> = {}) => ({
  id, title: id, topic: null, languages: [], hasPassword: false, isMember: false, memberCount: 1,
  owner: null, members: [], voiceCallParticipantCount: 0, hashRushActive: false, updatedAt: '2026-11-19T00:00:00.000Z', ...patch,
})

describe('open rooms: the list', () => {
  it('reads the API answer and drops junk', () => {
    const rooms = parseOpenRooms({ rooms: [
      { id: 'a', title: 'Trip talk', topic: 'travel', hasPassword: true, memberCount: 3, owner: { userId: 'u1', name: 'Mina', image: null }, members: [{ userId: 'u1' }, null] },
      null,
      { id: 'b' },
    ] })
    expect(rooms.map((entry) => entry.id)).toEqual(['a'])
    expect(rooms[0]).toMatchObject({ topic: 'travel', hasPassword: true, memberCount: 3, isMember: false, voiceCallParticipantCount: 0 })
    expect(rooms[0].owner?.name).toBe('Mina')
    expect(rooms[0].members).toHaveLength(1)
    expect(parseOpenRooms(null)).toEqual([])
  })

  it('says what is going on: a call wins over a game, a game over chat', () => {
    expect(openRoomStatus({ voiceCallParticipantCount: 2, hashRushActive: true })).toBe('voice')
    expect(openRoomStatus({ voiceCallParticipantCount: 0, hashRushActive: true })).toBe('game')
    expect(openRoomStatus({ voiceCallParticipantCount: 0, hashRushActive: false })).toBe('chat')
  })

  it('orders: my rooms, then calls, then games, then the latest change', () => {
    const sorted = sortOpenRooms([
      room('old', { updatedAt: '2026-11-01T00:00:00.000Z' }),
      room('new', { updatedAt: '2026-11-18T00:00:00.000Z' }),
      room('game', { hashRushActive: true, updatedAt: '2026-10-01T00:00:00.000Z' }),
      room('call', { voiceCallParticipantCount: 2, updatedAt: '2026-09-01T00:00:00.000Z' }),
      room('mine', { isMember: true, updatedAt: '2026-08-01T00:00:00.000Z' }),
    ])
    expect(sorted.map((entry) => entry.id)).toEqual(['mine', 'call', 'game', 'new', 'old'])
  })

  it('lists every public room on the server, with the password kept out of the card', () => {
    expect(serverSource).toContain('export async function listOpenRooms(')
    expect(serverSource).toContain('hasPassword: Boolean(record.passwordHash)')
    expect(serverSource).toContain('{ title: { contains: query, mode: "insensitive" as const } }')
    expect(serverSource).toContain('{ topic: { contains: query, mode: "insensitive" as const } }')
    expect(roomsSource).not.toContain('passwordHash')
  })
})

describe('open rooms: making one', () => {
  it('trims the title and the topic, and drops a leading #', () => {
    expect(normalizeOpenRoomTitle('  Seoul   trip  ')).toBe('Seoul trip')
    expect(normalizeOpenRoomTitle('   ')).toBeNull()
    expect(normalizeOpenRoomTitle('가'.repeat(60))).toHaveLength(40)
    expect(normalizeOpenRoomTopic('#K-POP ')).toBe('K-POP')
    expect(normalizeOpenRoomTopic('')).toBeNull()
  })

  it('takes no password, or one of 4 to 32 characters', () => {
    expect(readOpenRoomPassword('')).toEqual({ kind: 'none' })
    expect(readOpenRoomPassword(undefined)).toEqual({ kind: 'none' })
    expect(readOpenRoomPassword('abc')).toEqual({ kind: 'invalid' })
    expect(readOpenRoomPassword('abcd')).toEqual({ kind: 'ok', password: 'abcd' })
    expect(readOpenRoomPassword('x'.repeat(33))).toEqual({ kind: 'invalid' })
    expect(readOpenRoomPassword(1234)).toEqual({ kind: 'invalid' })
  })

  it('makes the room public with the typed title', () => {
    expect(serverSource).toContain('export async function createOpenRoom(')
    expect(serverSource).toContain('passwordHash: args.password ? hashOpenRoomPassword(args.password) : null')
    expect(roomsSource).toContain('buildClientApiPath("/conversations/open-rooms")')
  })
})

describe('open rooms: getting in', () => {
  it('asks for the password before joining a locked room', () => {
    expect(roomsSource).toContain('if (room.hasPassword) {\n      setPasswordRoom(room);')
    expect(roomsSource).toContain('/public-join')
    expect(serverSource).toContain('await assertOpenRoomPassword({ conversationId: record.id, userId: args.userId, passwordHash: record.passwordHash, password: args.password })')
  })

  it('checks the password for a room found by its number too', () => {
    expect(serverSource).toContain('if (found.hasPassword && !found.isMember) {')
  })

  it('says why a join failed', () => {
    const copy = { ...liveRoomsCopy('en'), ...openRoomsCopy('en') }
    expect(openRoomJoinErrorText('room_full', copy)).toBe(copy.roomFull)
    expect(openRoomJoinErrorText('password_wrong', copy)).toBe(copy.passwordWrong)
    expect(openRoomJoinErrorText('password_locked', copy)).toBe(copy.passwordLocked)
    expect(openRoomJoinErrorText(undefined, copy)).toBe(copy.joinFailed)
  })
})

describe('explore tabs and the chat list', () => {
  it('shows Open rooms and Posts as two tabs when nothing is typed, rooms first', () => {
    expect(searchSource).toContain('const [exploreTab, setExploreTab] = useState<ExploreTab>("rooms")')
    expect(searchSource).toContain('data-qa="explore-tabs"')
    expect(searchSource).toContain('{!normalizedQuery && onOpenLiveRoom && shownExploreTab === "rooms" ? (')
    expect(searchSource).toContain('shownExploreTab === "posts" ? (')
  })

  it('searches rooms by title or topic, and a room that matched is a result', () => {
    expect(searchSource).toContain('<OpenRooms locale={locale} query={dispatchedQuery} onOpenRoom={onOpenLiveRoom} onCountChange={setRoomMatchCount} />')
    expect(searchSource).toContain('showNoResults && roomCodeQuery === null && roomMatchCount === 0')
  })

  it('keeps open rooms out of the chat list', () => {
    expect(isChatListConversation({ isPublic: true })).toBe(false)
    expect(isChatListConversation({ isPublic: false })).toBe(true)
    expect(isChatListConversation({})).toBe(true)
  })

  it('has every label in all 15 languages', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      for (const value of Object.values({ ...liveRoomsCopy(locale), ...openRoomsCopy(locale) })) {
        expect(typeof value === 'function' ? value(2) : value).toBeTruthy()
      }
    }
    expect(openRoomsCopy('ko').tabRooms).toBe('오픈방')
    expect(openRoomsCopy('ko').tabPosts).toBe('포스팅')
  })
})

describe('public room switch and Hash Rush computer link', () => {
  it('puts the public switch in room management', () => {
    expect(liveDemoSource).toContain('data-qa="live-demo-public-room-switch"')
    expect(liveDemoSource).toContain('/visibility`')
  })

  it('builds a browser link into the same game room with the member ticket', () => {
    const link = new URL(buildHashRushPcLink({ pageUrl: 'https://game.example/play/', server: 'wss://ws.example', room: 'mingle-abc', ticket: 't.k', lang: 'ko' }))
    expect(link.origin + link.pathname).toBe('https://game.example/play/')
    expect(link.searchParams.get('server')).toBe('wss://ws.example')
    expect(link.searchParams.get('room')).toBe('mingle-abc')
    expect(link.searchParams.get('ticket')).toBe('t.k')
    expect(link.searchParams.get('lang')).toBe('ko')
    // Not embedded: the page keeps its own browser controls.
    expect(link.searchParams.has('embed')).toBe(false)
  })

  it('offers the link on the room menu\'s Hash Rush page', () => {
    expect(liveDemoSource).toContain('onCopyPcLink={HASH_RUSH_PAGE_URL ? () => void handleCopyHashRushPcLink() : undefined}')
    expect(liveDemoSource).toContain('fresh: true')
  })
})
