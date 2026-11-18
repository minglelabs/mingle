import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatRoomCode, parseRoomCode } from './room-code'

describe('room numbers', () => {
  it('formats 7 digits as "482 1937"', () => {
    expect(formatRoomCode(4821937)).toBe('482 1937')
    expect(formatRoomCode(999)).toBe('')
    expect(formatRoomCode(null)).toBe('')
  })

  it('reads what people type', () => {
    for (const text of ['4821937', '482 1937', '482-1937', '#4821937', ' 482 19 37 ']) {
      expect(parseRoomCode(text)).toBe(4821937)
    }
    for (const text of ['482193', '48219370', '0821937', 'abc1937', '', null]) {
      expect(parseRoomCode(text)).toBeNull()
    }
  })

  it('backfills existing rooms one at a time and gives new rooms a random free number', () => {
    const sql = readFileSync(new URL('../../prisma/migrations/20261111120000_add_room_code_and_join_requests/migration.sql', import.meta.url), 'utf8')
    expect(sql).toContain('candidate := 1000000 + floor(random() * 9000000)::INTEGER')
    expect(sql).toContain('FOR channel IN SELECT "id"')
    expect(sql).toContain('ALTER COLUMN "room_code" SET DEFAULT "app"."next_room_code"()')
    expect(sql).toContain('CREATE UNIQUE INDEX "app_conversation_channels_room_code_key"')
  })
})

describe('joining by number', () => {
  const server = readFileSync(new URL('./app-conversations.ts', import.meta.url), 'utf8')
  const search = readFileSync(new URL('../components/search/unified-search.tsx', import.meta.url), 'utf8')
  const result = readFileSync(new URL('../components/search/room-code-result.tsx', import.meta.url), 'utf8')
  const room = readFileSync(new URL('../components/LivePhoneDemo/LivePhoneDemo.tsx', import.meta.url), 'utf8')

  it('joins a public room at once and only requests a private one', () => {
    const body = server.slice(server.indexOf('export async function joinOrRequestByRoomCode'))
    expect(body).toContain('if (found.isPublic || found.isMember) {')
    expect(body).toContain('prisma.appConversationJoinRequest.upsert(')
    // A private room's name and languages stay hidden from non-members.
    expect(server).toContain('title: visible ? record.title : null')
  })

  it('adds the requester only when a member accepts', () => {
    const body = server.slice(server.indexOf('export async function decideConversationJoinRequest'))
    expect(body).toContain('getConversationSessionKeyForMember')
    expect(body.indexOf('joinConversationChannelById')).toBeLessThan(body.indexOf('status: "accepted"'))
  })

  it('shows the room card for a 7-digit query and the requests in room management', () => {
    expect(search).toContain('const roomCodeQuery = parseRoomCode(normalizedQuery)')
    expect(result).toContain('/conversations/by-code/${code}/join')
    expect(room).toContain('data-qa="live-demo-room-code"')
    expect(room).toContain('data-qa="live-demo-join-request-accept"')
  })
})
