import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { InboxRoomView as InboxRoomViewData } from '@/server/operator-inbox/inbox'
import { InboxListView, type InboxListData } from './inbox-list-view'
import { InboxRoomView } from './inbox-room-view'

// Server render of both screens with fixture data: catches render-time
// errors and pins the copy staff rely on (no browser or server needed).

const operator = {
  userId: 'op_1', handle: 'mina.silva', name: 'Mina', image: null,
  imageCropScale: null, imageCropX: null, imageCropY: null, isOperator: true as const,
  personaLanguage: 'pt', unreadCount: 2, isActive: true,
}
const counterpart = {
  userId: 'user_1', handle: 'joao', name: 'João', image: 'https://img.example/joao.jpg',
  imageCropScale: 1.2, imageCropX: 0, imageCropY: 0,
}

const listData: InboxListData = {
  rooms: [{
    conversationId: 'conv_1',
    isGroup: false,
    operators: [operator],
    counterparts: [counterpart],
    latestMessage: {
      messageId: 'msg_1', senderUserId: 'user_1', fromOperator: false, createdAt: '2026-09-30T09:58:00.000Z',
      kind: 'text', text: 'Olá, tudo bem?', language: 'pt', koText: '안녕, 잘 지내?',
    },
    activityAt: '2026-09-30T09:58:00.000Z',
    unreadCount: 2,
    blocked: false,
  }],
  nextCursor: '1727690280000.conv_1',
  unreadTotal: 2,
  operators: [{ ...operator, roomCount: 1 }],
  serverNowMs: Date.parse('2026-09-30T10:00:00.000Z'),
}

const roomView: InboxRoomViewData = {
  room: {
    conversationId: 'conv_1',
    operator,
    operators: [operator],
    counterparts: [counterpart],
    isGroup: false,
    blocked: false,
    replyUnavailableReason: null,
  },
  hydration: {
    conversation: {
      id: 'conv_1', sequenceNumber: 1, title: 'João', status: 'active', sessionKey: 'sess_1',
      isMultiMember: true, isBlockedCounterpart: false, selectedLanguages: ['pt', 'en'],
      selectedLanguagesAttribution: {}, viewerSelectedLanguages: ['pt'], speechLanguages: ['pt'],
      translationLanguagesLinked: true, defaultDisplayLanguage: 'pt', otherMembers: [],
      createdAt: '2026-09-30T09:00:00.000Z', updatedAt: '2026-09-30T09:58:00.000Z', pausedAt: null,
      shareToken: null, shareEnabled: false,
    },
    usageSec: 0,
    messageCount: 2,
    utterances: [
      {
        id: 'u-1-1', originalText: 'Hi Mina!', originalLang: 'en', targetLanguages: ['pt', 'en'],
        translations: { pt: 'Oi Mina!' }, translationFinalized: { pt: true }, createdAtMs: Date.parse('2026-09-30T09:57:00.000Z'),
        serverCreatedAtMs: Date.parse('2026-09-30T09:57:00.000Z'), serverMessageId: 'msg_0',
        speaker: null, speakerAvatarSeed: null, speakerAvatarIndex: null,
        speakerName: 'João', speakerUserId: 'user_1', speakerImage: null,
      },
      {
        id: 'op-req-1', originalText: 'Olá, João!', originalLang: 'pt', targetLanguages: ['pt', 'en'],
        translations: { en: 'Hello, João!' }, translationFinalized: { en: true }, createdAtMs: Date.parse('2026-09-30T09:58:00.000Z'),
        serverCreatedAtMs: Date.parse('2026-09-30T09:58:00.000Z'), serverMessageId: 'msg_1',
        speaker: null, speakerAvatarSeed: null, speakerAvatarIndex: null,
        speakerName: 'Mina', speakerUserId: 'op_1', speakerImage: null,
      },
      {
        id: 'u-2-1', originalText: '📷 Photo', originalLang: 'en', targetLanguages: [], translations: {}, translationFinalized: {},
        createdAtMs: Date.parse('2026-09-30T09:59:00.000Z'), serverCreatedAtMs: Date.parse('2026-09-30T09:59:00.000Z'),
        serverMessageId: 'msg_2', image: { conversationId: 'conv_1', messageId: 'msg_2', width: 400, height: 300 },
        speaker: null, speakerAvatarSeed: null, speakerAvatarIndex: null,
        speakerName: 'João', speakerUserId: 'user_1', speakerImage: null,
      },
    ],
    hasMoreUtterances: true,
    oldestMessageCursor: { createdAtMs: Date.parse('2026-09-30T09:57:00.000Z'), messageId: 'msg_0' },
    leaveNotices: [],
    inviteNotices: [],
  },
}

describe('admin inbox screens (server render)', () => {
  // React separates adjacent text nodes with <!-- --> in server HTML.
  const render = (element: Parameters<typeof renderToString>[0]) => renderToString(element).replace(/<!-- -->/g, '')

  it('renders the list with persona chip, preview, unread badge, filter chips and the Korean switch', () => {
    const html = render(createElement(InboxListView, { initialData: listData, initialOperatorId: null }))
    expect(html).toContain('인박스')
    expect(html).toContain('João')
    expect(html).toContain('운영 계정')
    expect(html).toContain('Mina')
    expect(html).toContain('Olá, tudo bem?')
    expect(html).toContain('2분 전')
    expect(html).toContain('안 읽은 메시지 2개')
    expect(html).toContain('한국어로 보기')
    expect(html).toContain('더 보기')
    expect(html).toContain('href="/admin/inbox/conv_1"')
  })

  it('renders the room as the operator: header, disclosure, bubbles, photo proxy and composer', () => {
    const html = render(createElement(InboxRoomView, { initialView: roomView }))
    expect(html).toContain('↔')
    expect(html).toContain('답장 언어 포르투갈어')
    expect(html).toContain('이 대화에는 Mingle 팀이 운영하는 계정이 있습니다')
    expect(html).toContain('Olá, João!')
    // The counterpart's bubble shows in the operator's display language.
    expect(html).toContain('Oi Mina!')
    // Photos load through the admin proxy, never the member-session route.
    expect(html).toContain('/admin/inbox/api/images/msg_2')
    expect(html).not.toContain('/conversations/conv_1/images/msg_2')
    expect(html).toContain('이전 메시지 보기')
    expect(html).toContain('어떤 언어로 써도 번역해서 보냅니다')
    expect(html).toContain('Mina 이름으로 전송 · 포르투갈어 번역')
  })

  it('replaces the composer with the reason when a reply is not possible', () => {
    const html = render(createElement(InboxRoomView, {
      initialView: { ...roomView, room: { ...roomView.room, blocked: true, replyUnavailableReason: 'blocked' } },
    }))
    expect(html).toContain('상대방과 차단 관계라 답장할 수 없습니다.')
    expect(html).not.toContain('어떤 언어로 써도 번역해서 보냅니다')
  })
})
