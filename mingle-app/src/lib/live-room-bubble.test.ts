import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n/config'
import { liveRoomBubbleCopy } from '@/i18n/live-room-bubble-copy'
import {
  BUBBLE_EDGE_GAP,
  BUBBLE_HANDLE_WIDTH,
  applyNativeVoiceEvent,
  bubbleDropPoint,
  bubbleLeft,
  clampBubbleY,
  getLiveRoomBubbleForTests,
  getRememberedLiveRoom,
  isOverBubbleDrop,
  publishLiveStt,
  publishVisibleRoom,
  rememberLiveRoom,
  resetLiveRoomBubbleForTests,
  restBubble,
} from './live-room-bubble'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const bubbleSource = read('../components/live-room-bubble.tsx')
const tabBarSource = read('../components/bottom-tab-bar.tsx')
const listSource = read('../components/conversation-list.tsx')
const panelSource = read('../components/LivePhoneDemo/VoiceTalkPanel.tsx')

const member = (userId: string, patch: Partial<{ name: string; isLocal: boolean; isSpeaking: boolean }> = {}) => ({
  userId, name: patch.name ?? userId, isLocal: patch.isLocal === true, isSpeaking: patch.isSpeaking === true,
})
const room = (conversationId: string, members: ReturnType<typeof member>[]) => ({ type: 'room', conversationId, snapshot: { members } })

beforeEach(() => resetLiveRoomBubbleForTests())

describe('live room bubble: when it shows', () => {
  it('shows a call in a room that is not on screen, and hides it for the room on screen', () => {
    rememberLiveRoom('r1', { title: 'Seoul trip', lang: 'ko' })
    applyNativeVoiceEvent({ type: 'state', phase: 'connected', conversationId: 'r1' })
    expect(getLiveRoomBubbleForTests()).toMatchObject({ kind: 'voice', conversationId: 'r1', title: 'Seoul trip' })
    publishVisibleRoom('r1')
    expect(getLiveRoomBubbleForTests()).toBeNull()
    publishVisibleRoom('other')
    expect(getLiveRoomBubbleForTests()?.conversationId).toBe('r1')
  })

  it('goes away when the phone leaves the call', () => {
    applyNativeVoiceEvent(room('r1', [member('me', { isLocal: true })]))
    expect(getLiveRoomBubbleForTests()).not.toBeNull()
    applyNativeVoiceEvent({ type: 'state', phase: 'left', conversationId: 'r1' })
    expect(getLiveRoomBubbleForTests()).toBeNull()
  })

  it('shows whoever is speaking, with their photo, then keeps the last speaker', () => {
    applyNativeVoiceEvent({ type: 'status', conversationId: 'r1', call: { participants: [{ userId: 'b', image: 'b.jpg' }] } })
    applyNativeVoiceEvent(room('r1', [member('me', { isLocal: true }), member('a'), member('b', { name: 'Bo', isSpeaking: true })]))
    expect(getLiveRoomBubbleForTests()?.face).toEqual({ userId: 'b', name: 'Bo', image: 'b.jpg', speaking: true })
    applyNativeVoiceEvent(room('r1', [member('me', { isLocal: true }), member('a'), member('b', { name: 'Bo' })]))
    expect(getLiveRoomBubbleForTests()?.face).toMatchObject({ userId: 'b', speaking: false })
  })

  it('shows live speech recognition when no call is on, and a call wins over it', () => {
    publishLiveStt({ conversationId: 's1', title: 'Notes' })
    expect(getLiveRoomBubbleForTests()).toMatchObject({ kind: 'stt', conversationId: 's1', title: 'Notes', face: null })
  })

  it('shows the host of the room while they are in the call, and how many people are in it', () => {
    applyNativeVoiceEvent({ type: 'state', phase: 'connected', conversationId: 'r9' })
    applyNativeVoiceEvent({ type: 'status', conversationId: 'r9', call: { participants: [{ userId: 'h', image: 'h.jpg' }], stage: { hostUserId: 'h' } } })
    applyNativeVoiceEvent({ type: 'room', conversationId: 'r9', snapshot: { members: [
      { userId: 'me', name: 'Me', isLocal: true, isSpeaking: false },
      { userId: 'b', name: 'Bo', isLocal: false, isSpeaking: true },
      { userId: 'h', name: 'Host', isLocal: false, isSpeaking: false },
    ] } })
    expect(getLiveRoomBubbleForTests()).toMatchObject({ count: 3, face: { userId: 'h', name: 'Host', image: 'h.jpg', speaking: false } })
    // The host left the call: back to whoever is speaking.
    applyNativeVoiceEvent({ type: 'room', conversationId: 'r9', snapshot: { members: [
      { userId: 'me', name: 'Me', isLocal: true, isSpeaking: false },
      { userId: 'b', name: 'Bo', isLocal: false, isSpeaking: true },
    ] } })
    expect(getLiveRoomBubbleForTests()).toMatchObject({ count: 2, face: { userId: 'b', speaking: true } })
  })

  it('is a rounded square with a leave button tall enough to hit', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/live-room-bubble.tsx'), 'utf8')
    expect(source).toContain('const BOX = { width: 124, height: 148 };')
    expect(source).toContain('const LEAVE_HEIGHT_PX = 42;')
    expect(source).toContain('data-qa="live-room-bubble-count"')
    applyNativeVoiceEvent(room('r1', [member('me', { isLocal: true })]))
    expect(getLiveRoomBubbleForTests()?.kind).toBe('voice')
    publishLiveStt(null)
    applyNativeVoiceEvent({ type: 'state', phase: 'left', conversationId: 'r1' })
    expect(getLiveRoomBubbleForTests()).toBeNull()
  })

  it('remembers the title and the language a call was joined in, for undo', () => {
    rememberLiveRoom('r1', { title: 'Seoul trip', lang: 'ko' })
    rememberLiveRoom('r1', { title: '' })
    expect(getRememberedLiveRoom('r1')).toEqual({ title: 'Seoul trip', lang: 'ko' })
    expect(panelSource).toContain('rememberLiveRoom(input.conversationId, { title: input.title, lang: input.lang })')
  })
})

describe('live room bubble: where it rests', () => {
  const box = { width: 156, height: 72 }
  const area = { width: 375, height: 812, top: 64, bottom: 86 }

  it('rests on the nearer side', () => {
    expect(restBubble({ x: 40, y: 300 }, box, area)).toEqual({ side: 'left', y: 300, folded: false })
    expect(restBubble({ x: 200, y: 300 }, box, area)).toEqual({ side: 'right', y: 300, folded: false })
    expect(bubbleLeft({ side: 'left', y: 300, folded: false }, box, area)).toBe(BUBBLE_EDGE_GAP)
    expect(bubbleLeft({ side: 'right', y: 300, folded: false }, box, area)).toBe(375 - 156 - BUBBLE_EDGE_GAP)
  })

  it('stays clear of the top and of the tab bar', () => {
    expect(clampBubbleY(0, box, area)).toBe(64 + BUBBLE_EDGE_GAP)
    expect(clampBubbleY(9999, box, area)).toBe(812 - 86 - 72 - BUBBLE_EDGE_GAP)
  })

  it('moves up when the keyboard takes the bottom of the screen', () => {
    const withKeyboard = { ...area, height: 500 }
    expect(clampBubbleY(600, box, withKeyboard)).toBe(500 - 86 - 72 - BUBBLE_EDGE_GAP)
  })

  it('folds into a handle when thrown past an edge', () => {
    expect(restBubble({ x: -60, y: 300 }, box, area)).toMatchObject({ side: 'left', folded: true })
    expect(restBubble({ x: 375 - 156 + 60, y: 300 }, box, area)).toMatchObject({ side: 'right', folded: true })
    expect(bubbleLeft({ side: 'right', y: 300, folded: true }, box, area)).toBe(375 - BUBBLE_HANDLE_WIDTH)
    expect(bubbleLeft({ side: 'left', y: 300, folded: true }, box, area)).toBe(0)
  })

  it('knows when it is over the leave circle at the bottom centre', () => {
    const drop = bubbleDropPoint(area)
    expect(drop.x).toBe(375 / 2)
    expect(isOverBubbleDrop({ x: drop.x - box.width / 2, y: drop.y - box.height / 2 }, box, area)).toBe(true)
    expect(isOverBubbleDrop({ x: 8, y: 100 }, box, area)).toBe(false)
  })
})

describe('live room bubble: wiring', () => {
  it('is drawn with the tab bar, so it is on every tab', () => {
    expect(tabBarSource).toContain('<LiveRoomBubble')
  })

  it('leaves a call without asking and offers undo; a tap goes to the room', () => {
    expect(bubbleSource).toContain('postToApp({ type: "native_voice_close" });')
    expect(bubbleSource).toContain('data-qa="live-room-bubble-undo"')
    expect(bubbleSource).toContain('type: "native_voice_open"')
    expect(bubbleSource).toContain('if (getLiveRoomHandlers().openRoom?.(view.conversationId)) return;')
    expect(bubbleSource).not.toContain('window.confirm')
  })

  it('gets the room on screen and the live speech recognition from the chat list', () => {
    expect(listSource).toContain('publishVisibleRoom(activeConversationIdForBubble);')
    expect(listSource).toContain('publishLiveStt(liveConversationId ? { conversationId: liveConversationId, title: liveConversationTitle } : null);')
    expect(listSource).toContain('setLiveRoomHandlers(null);')
  })

  it('has its words in all 15 languages', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      for (const value of Object.values(liveRoomBubbleCopy(locale))) expect(value).toBeTruthy()
    }
    expect(liveRoomBubbleCopy('ko').undo).toBe('되돌리기')
  })
})
