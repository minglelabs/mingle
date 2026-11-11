import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildHashRushPcLink } from '@/features/hash-rush/config'
import { liveRoomsCopy } from '@/i18n/live-rooms-copy'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n/config'
import { parseLiveRooms } from './live-rooms'

const roomsSource = readFileSync(new URL('./live-rooms.tsx', import.meta.url), 'utf8')
const searchSource = readFileSync(new URL('./unified-search.tsx', import.meta.url), 'utf8')
const serverSource = readFileSync(new URL('../../lib/app-conversations.ts', import.meta.url), 'utf8')
const liveDemoSource = readFileSync(new URL('../LivePhoneDemo/LivePhoneDemo.tsx', import.meta.url), 'utf8')

describe('search tab live rooms', () => {
  it('reads the API answer and drops junk', () => {
    expect(parseLiveRooms({ rooms: [{ id: 'a', isPublic: true }, null, { nope: 1 }] }).map((room) => room.id)).toEqual(['a'])
    expect(parseLiveRooms(null)).toEqual([])
  })

  it('shows the section only with no query, above the results', () => {
    expect(searchSource).toContain('{!normalizedQuery && onOpenLiveRoom ? <LiveRooms locale={locale} onOpenRoom={onOpenLiveRoom} /> : null}')
  })

  it('joins only public rooms; a private room is a locked card without its name', () => {
    expect(roomsSource).toContain('if (!room.isPublic || busyId) return')
    expect(roomsSource).toContain('/public-join')
    expect(serverSource).toContain('title: isPublic ? record.title : null')
    expect(serverSource).toContain("languages: isPublic ? record.selectedLanguages.slice(0, 5) : []")
  })

  it('has every label in all 15 languages', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = liveRoomsCopy(locale)
      for (const value of Object.values(copy)) {
        expect(typeof value === 'function' ? value(2) : value).toBeTruthy()
      }
    }
    expect(liveRoomsCopy('ko').heading).toBe('지금 라이브')
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
