import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import VoiceRoomStage, { voiceRoomSlotCount, type VoiceRoomStageProps } from './VoiceRoomStage'
import { voiceRoomCopy } from '@/i18n/voice-room-copy'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'

vi.mock('@/components/language-flag', () => ({ default: ({ language }: { language: string }) => createElement('i', { 'data-flag': language }) }))

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const noop = () => undefined

const labels: VoiceRoomStageProps['labels'] = {
  status: '보이스톡 3명', join: '보이스룸 참여하기', host: '방장', me: '나', emptySeat: '빈 자리', micMuted: '마이크 꺼짐',
  mic: '마이크', hand: '손들기', lowerHand: '손 내리기', interpret: '통역', listen: '듣기', leave: '나가기', audience: '듣는 사람 2',
  quiet: '아직 아무도 없어요', toStage: '무대로 올리기', offStage: '무대에서 내리기', stepDown: '무대에서 내려가기', fold: '접기', open: '펼치기',
}
const seat = (id: string, more: Partial<VoiceRoomStageProps['seats'][number]> = {}) => ({
  key: id, userId: id, name: id, isLocal: false, isSpeaking: false, image: null, lang: 'ko', micOn: true, ...more,
})
const base: VoiceRoomStageProps = {
  labels,
  seats: [seat('host', { isSpeaking: true }), seat('me', { isLocal: true, micOn: false }), seat('mia', { lang: 'ja' })],
  seatCount: 8,
  hostUserId: 'host',
  viewerUserId: 'me',
  listeners: [{ userId: 'l1', name: 'Ken', image: null, handRaised: true }],
  bystanders: [{ id: 'b1', name: 'Ana', image: null, viewing: true }],
  joined: true, connecting: false, stageEnabled: true, isHost: false, myRole: 'speaker', myHandRaised: false,
  micOn: false, interpretOn: true, listenOn: true, earphonesConnected: false, busy: false, folded: false, error: null, note: null,
  onJoin: noop, onLeave: noop, onToggleMic: noop, onToggleHand: noop, onToggleInterpret: noop, onToggleListen: noop,
  onInvite: noop, onRemove: noop, onStepDown: noop, onToggleFold: noop,
}
const count = (html: string, needle: string) => html.split(needle).length - 1
const render = (more: Partial<VoiceRoomStageProps> = {}) => renderToStaticMarkup(createElement(VoiceRoomStage, { ...base, ...more }))

describe('the voice room stage', () => {
  it('draws whole rows of seats: the people on the stage, then empty ones', () => {
    expect([0, 3, 4, 7, 8].map((seated) => voiceRoomSlotCount(seated, 8))).toEqual([4, 4, 8, 8, 8])
    const html = render()
    expect(count(html, 'data-qa="voice-room-seat"')).toBe(3)
    expect(count(html, 'data-qa="voice-room-empty-seat"')).toBe(1)
    // The host's seat carries the crown, a speaking seat its ring, a muted one its badge.
    expect(count(html, 'data-qa="voice-room-host"')).toBe(1)
    expect(count(html, 'data-qa="voice-room-seat-speaking"')).toBe(1)
    expect(count(html, 'data-qa="voice-room-seat-muted"')).toBe(1)
    // The people who only listen, with a raised hand, and the rest of the room.
    expect(html).toContain('data-qa="voice-room-hand"')
    expect(html).toContain('data-qa="voice-room-bystander"')
  })

  it('gives someone in the call labelled buttons, and someone outside it one wide button to come in', () => {
    const inside = render()
    for (const qa of ['voice-room-mic', 'voice-room-interpret', 'voice-room-listen', 'voice-room-leave', 'voice-room-step-down']) {
      expect(inside).toContain(`data-qa="${qa}"`)
    }
    expect(inside).not.toContain('data-qa="voice-room-join"')
    const outside = render({ joined: false, myRole: null, seats: [], listeners: [], bystanders: [] })
    expect(outside).toContain('data-qa="voice-room-join"')
    expect(outside).not.toContain('data-qa="voice-room-mic"')
    expect(count(outside, 'data-qa="voice-room-empty-seat"')).toBe(4)
    expect(outside).toContain(labels.quiet)
  })

  it('lets a listener raise a hand instead of the mic, and the host move people', () => {
    const listener = render({ myRole: 'listener' })
    expect(listener).toContain('data-qa="voice-room-raise-hand"')
    expect(listener).not.toContain('data-qa="voice-room-mic"')
    const host = render({ isHost: true, viewerUserId: 'host' })
    expect(host).toContain('data-qa="voice-room-remove"')
    expect(host).toContain('data-qa="voice-room-invite"')
  })

  it('folds to its status row', () => {
    const html = render({ folded: true })
    expect(html).toContain('data-folded="true"')
    expect(html).not.toContain('data-qa="voice-room-seats"')
  })

  it('is the screen of an open room, with the chat starting below it, in every app language', () => {
    const room = read('src/components/LivePhoneDemo/LivePhoneDemo.tsx')
    expect(room).toContain("variant={isPublicRoom ? 'room' : 'panel'}")
    expect(room).toContain('? `${voiceRoomStageHeightPx + 10}px`')
    expect(read('src/components/LivePhoneDemo/VoiceTalkPanel.tsx')).toContain('<VoiceRoomStage')
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = voiceRoomCopy(locale)
      for (const text of [copy.join, copy.host, copy.emptySeat, copy.mic, copy.hand, copy.interpret, copy.listen, copy.leave, copy.quiet]) expect(text.length).toBeGreaterThan(0)
      expect(copy.audience(3)).toContain('3')
    }
  })
})
