import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n/config'
import { openRoomsCopy } from '@/i18n/open-rooms-copy'
import { reportCopy } from '@/i18n/report-copy'
import { buildReportTargetKey } from '@/server/reports/report-service'
import { parseOpenRoomInfo } from './OpenRoomExtras'
import { openRoomPeopleNeedReload, resolveOpenRoomPeople } from './open-room-people'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const liveDemoSource = read('./LivePhoneDemo.tsx')
const extrasSource = read('./OpenRoomExtras.tsx')
const serverSource = read('../../lib/app-conversations.ts')
const controllerSource = read('../../server/api/controllers/shared/public-room-controller.ts')
const listSource = read('../conversation-list.tsx')

const members = [
  { id: 'me', name: 'Me', image: null },
  { id: 'a', name: 'Ari', image: 'a.jpg' },
  { id: 'b', name: 'Bo', image: null },
]

describe('open room: the row of people who are here now', () => {
  it('shows the people with the room open, others first and the viewer last', () => {
    const people = resolveOpenRoomPeople({ members, presence: ['a', 'me'], viewerUserId: 'me' })
    expect(people.map((person) => person.id)).toEqual(['a', 'me'])
  })

  it('shows only the viewer while the server has not said who is here', () => {
    expect(resolveOpenRoomPeople({ members, presence: null, viewerUserId: 'me' }).map((person) => person.id)).toEqual(['me'])
  })

  it('draws someone who is here before their profile has loaded, and asks for the list again', () => {
    const people = resolveOpenRoomPeople({ members, presence: ['new'], viewerUserId: 'me' })
    expect(people[0]).toEqual({ id: 'new', name: null, image: null })
    expect(openRoomPeopleNeedReload(members, ['new'])).toBe(true)
    expect(openRoomPeopleNeedReload(members, ['a'])).toBe(false)
    expect(openRoomPeopleNeedReload(members, null)).toBe(false)
  })

  it('is drawn only in an open room, and a face opens the profile', () => {
    expect(liveDemoSource).toContain("{conversationId && isPublicRoom && headerMode === 'conversation' && isVisible ? (")
    expect(extrasSource).toContain('if (person.id !== viewerUserId) onOpenProfile?.(person.id)')
    expect(listSource).toContain('initialIsPublicRoom={conversation.isPublic === true}')
  })
})

describe('open room: its part of the room menu', () => {
  it('reads the room facts and drops junk', () => {
    expect(parseOpenRoomInfo({ room: { id: 'r', title: 'T', isPublic: true, topic: 'trip', hasPassword: true, isHost: true, hostUserId: 'u' } }))
      .toEqual({ id: 'r', title: 'T', isPublic: true, topic: 'trip', hasPassword: true, isHost: true, hostUserId: 'u' })
    expect(parseOpenRoomInfo({ room: { id: 'r' } })).toMatchObject({ isPublic: false, topic: null, hasPassword: false, isHost: false })
    expect(parseOpenRoomInfo(null)).toBeNull()
  })

  it('has share, minimize and leave, then host settings or report, then other rooms', () => {
    for (const qa of ['open-room-share', 'open-room-minimize', 'open-room-leave', 'open-room-host-settings-toggle', 'open-room-report', 'open-room-menu-joined', 'open-room-menu-recommended']) {
      expect(extrasSource).toContain(qa)
    }
    expect(liveDemoSource).toContain('{conversationId && isPublicRoom && openRoomInfo?.isPublic ? (')
    // The host sees settings, everyone else sees report.
    expect(extrasSource).toContain('{info.isHost ? (')
  })

  it('moves to another room without asking; a locked room is not offered there', () => {
    expect(extrasSource).toContain('(room.isMember || !room.hasPassword)')
    expect(extrasSource).toContain('onOpenRoom(room.id, body.conversation)')
    expect(listSource).toContain('const target = joined ?? conversationsRef.current.find((conversation) => conversation.id === conversationId);')
  })

  it('lets only the host change the topic and the password', () => {
    expect(serverSource).toContain('if (!info || !info.isHost) return null;')
    expect(controllerSource).toContain('if (!room) return NextResponse.json({ error: "forbidden" }, { status: 403 });')
  })

  it('files a room report on the host, never on your own room', () => {
    expect(buildReportTargetKey('room', ' abc ')).toBe('room:abc')
    expect(controllerSource).toContain('targetType: "room"')
    expect(controllerSource).toContain('if (room.hostUserId === userId) return NextResponse.json({ error: "cannot_report_own_content" }, { status: 400 });')
  })

  it('has the labels in all 15 languages', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = openRoomsCopy(locale)
      for (const key of ['minimize', 'hostSettings', 'recommended', 'save', 'saved', 'saveFailed', 'removePassword', 'passwordOn', 'newPassword', 'hereNow'] as const) {
        expect(copy[key]).toBeTruthy()
      }
      expect(reportCopy(locale).reportTitleRoom).toBeTruthy()
    }
    expect(openRoomsCopy('ko').minimize).toBe('최소화')
  })
})
