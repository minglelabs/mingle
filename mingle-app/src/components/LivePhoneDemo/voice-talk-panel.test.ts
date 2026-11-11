import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  VoiceTalkButton,
  VoiceTalkSeatView,
  isAbandonedJoinedCall,
  visibleVoiceTalkSeats,
  parseRoomMemberSummaries,
  resolveVoiceTalkBystanders,
  resolveVoiceTalkButtonPress,
  resolveVoiceTalkMic,
} from './VoiceTalkPanel'
const copySource = readFileSync(new URL('../../i18n/voice-talk-copy.ts', import.meta.url), 'utf8')

const panelSource = readFileSync(new URL('./VoiceTalkPanel.tsx', import.meta.url), 'utf8')
const liveDemoSource = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')

describe('voice talk mic', () => {
  it('follows only the listen-only switch', () => {
    expect(resolveVoiceTalkMic({ listenOnly: false })).toBe(true)
    expect(resolveVoiceTalkMic({ listenOnly: true })).toBe(false)
  })

  it('starts every call with the mic on', () => {
    expect(liveDemoSource).toContain('    if (voiceTalkState.joined) return\n    setVoiceTalkListenOnly(false)')
  })
})

describe('a call takes over speech-to-text', () => {
  const block = liveDemoSource.slice(
    liveDemoSource.indexOf('// A voice talk takes over the room'),
    liveDemoSource.indexOf('const confirmScreenCaptureNotice = useCallback'),
  )

  it('stops the room speech-to-text on joining and never starts it in a call (the server interprets)', () => {
    expect(block.length).toBeGreaterThan(0)
    expect(block).not.toContain('handleStartRecording')
    expect(block).toContain('handleStopRecording()')
  })

  it('moves the call mic only by the listen-only switch', () => {
    expect(block).toContain('setVoiceTalkMic(resolveVoiceTalkMic({ listenOnly }))')
  })

  it('has an interpret button that the room reads, and a hint while it is off', () => {
    expect(liveDemoSource).toContain('onInterpretChange={handleVoiceTalkInterpretChange}')
    expect(panelSource).toContain('data-qa="voice-talk-interpret-toggle"')
    expect(panelSource).toContain('{joined && !interpretOn ? (')
  })

  it('keeps the room speaker mode off in a call: the interpreter reads on the call itself', () => {
    expect(liveDemoSource).toContain('const earphoneModeEnabled = voiceTalkState.joined ? false : earphoneModePreference')
  })

  it('runs the echo canceller while in a call, so the other voices are not transcribed as mine', () => {
    expect(liveDemoSource).toContain('enableAec: aecEnabled || speakerModeAecEnabled || voiceTalkState.joined,')
  })
})

describe('voice talk button', () => {
  it('asks to start, to join, or to leave, depending on the room\'s call', () => {
    expect(resolveVoiceTalkButtonPress({ joined: false })).toBe('confirm_start')
    expect(resolveVoiceTalkButtonPress({ joined: false, live: true })).toBe('confirm_join')
    expect(resolveVoiceTalkButtonPress({ joined: true, live: true })).toBe('confirm_leave')
    expect(liveDemoSource).toContain('setVoiceTalkLeaveSignal((n) => n + 1)')
    expect(liveDemoSource).toContain('leaveSignal={voiceTalkLeaveSignal}')
  })

  it('has a tap area beyond the drawn button, but not over its right neighbor', () => {
    const html = renderToStaticMarkup(createElement(VoiceTalkButton, { uiLocale: 'ko', active: false, onPress: () => {} }))
    expect(html).toContain('data-qa="voice-talk-button-hit-area"')
    expect(html).toMatch(/-left-4/)
    expect(html).toMatch(/right-0/)
    // Same drawn size as before.
    expect(html).toContain('width:44px;height:44px')
  })
})

describe('voice talk panel', () => {
  it('leaves at once from the panel\'s own button; only the room\'s phone button asks first', () => {
    const panelLeave = panelSource.slice(panelSource.indexOf('data-qa="voice-talk-leave"'), panelSource.indexOf('data-qa="voice-talk-leave"') + 300)
    expect(panelLeave).toContain('onClick={leave}')
    expect(panelSource).not.toContain('onClick={() => setConfirmLeave(true)}')
    expect(panelSource).toContain('if (leaveSignal && joined) setConfirmLeave(true)')
    expect(copySource).toContain("leaveTitle: '보이스톡에서 나가시겠습니까?'")
    expect(panelSource).toContain('data-qa="voice-talk-leave-confirm-button"')
    expect(panelSource.split("post({ type: 'native_voice_close' })").length - 1).toBe(1)
  })

  it('has a mic switch for listening only, in both languages', () => {
    expect(panelSource).toContain('data-qa="voice-talk-mic-toggle"')
    expect(copySource).toContain("listenOnly: '듣기만 하는 중'")
    expect(copySource).toContain("listenOnly: 'Listening only'")
  })

  it('labels the mic button with its state, not with the action', () => {
    expect(copySource).toContain("micOnState: '내 목소리 켜짐'")
    expect(copySource).toContain("micOffState: '내 목소리 꺼짐'")
    expect(panelSource).not.toContain('마이크 끄기')
    expect(panelSource).not.toContain('마이크 켜기')
    expect(panelSource).toContain('{copy.micOffState}</span></> : <><Mic size={16} className="shrink-0" /> <span className="truncate">{copy.micOnState}')
  })

  it('gives the mic, interpret and leave buttons a full-height tap target and space between them', () => {
    const row = panelSource.slice(panelSource.indexOf('data-qa="voice-talk-mic-toggle"') - 400, panelSource.indexOf('data-qa="voice-talk-leave"') + 400)
    expect(row).toContain('gap-2')
    expect(row.split('h-11').length - 1).toBe(3)
  })

  it('shows my own mic switch at once and the others\' from the call', () => {
    expect(panelSource).toContain('micOn: m.isLocal ? !listenOnly : m.micOn !== false,')
    expect(liveDemoSource).toContain('onOpenProfile={handleOpenProfileForBubble}')
  })
})

describe('voice talk seat', () => {
  const seat = { key: 'u1', userId: 'u1', name: 'Mina', isLocal: false, isSpeaking: false, image: null, lang: 'ko', micOn: true }
  const render = (overrides: Partial<typeof seat>, onOpenProfile?: (userId: string) => void) => renderToStaticMarkup(
    createElement(VoiceTalkSeatView, { seat: { ...seat, ...overrides }, label: 'Mina', mutedLabel: '음소거', onOpenProfile }),
  )

  it('shows the language flag at the bottom-left of the avatar', () => {
    const html = render({})
    expect(html).toContain('data-qa="voice-talk-seat-flag"')
    expect(html).toMatch(/-bottom-\[2px\] -left-\[2px\]/)
    expect(render({ lang: '' })).not.toContain('data-qa="voice-talk-seat-flag"')
  })

  it('covers the middle of the avatar with a mute icon while the mic is off', () => {
    expect(render({})).not.toContain('data-qa="voice-talk-seat-muted"')
    const muted = render({ micOn: false })
    expect(muted).toContain('data-qa="voice-talk-seat-muted"')
    expect(muted).toContain('absolute inset-0 flex items-center justify-center')
  })

  it('ripples softly while the member speaks, never while muted', () => {
    expect(render({})).not.toContain('mingle-voice-ripple')
    const speaking = render({ isSpeaking: true })
    expect(speaking.split('mingle-voice-ripple ').length - 1).toBe(2)
    // Neutral gray, not the amber of the avatar placeholder.
    expect(speaking).toContain('bg-slate-400/25')
    expect(speaking).toContain('bg-slate-300/30')
    expect(speaking).not.toMatch(/bg-amber-(200|300)\/\d+/)
    expect(speaking).not.toContain('ring-amber-400')
    expect(render({ isSpeaking: true, micOn: false })).not.toContain('mingle-voice-ripple')
  })

  it('opens the profile when tapped, when the room can open one', () => {
    expect(render({}, () => {})).toContain('data-qa="voice-talk-seat-profile"')
    expect(render({})).not.toContain('data-qa="voice-talk-seat-profile"')
  })

  it('draws an empty seat with none of that', () => {
    const html = renderToStaticMarkup(createElement(VoiceTalkSeatView, { seat: null, label: '빈 자리', mutedLabel: '음소거' }))
    expect(html).toContain('border-dashed')
    expect(html).not.toContain('data-qa="voice-talk-seat-flag"')
    expect(html).not.toContain('data-qa="voice-talk-seat-profile"')
  })
})

describe('leaving a call', () => {
  it('hides the panel and empties this phone\'s seat at once, before the app answers', () => {
    const leave = panelSource.slice(panelSource.indexOf('const leave = useCallback(() => {'), panelSource.indexOf('// Seats: who is in the call'))
    expect(leave.indexOf("setPhase('left')")).toBeGreaterThan(0)
    expect(leave.indexOf("setPhase('left')")).toBeLessThan(leave.indexOf("post({ type: 'native_voice_close' })"))
    expect(leave).toContain('setDeclinedCallId(call.id)')
    expect(leave).toContain('participants: call.participants.filter((p) => p.userId !== localId)')
  })
})

describe('room members not in the call', () => {
  const members = [
    { id: 'me', name: 'Me', image: null },
    { id: 'in-call', name: 'Talker', image: null },
    { id: 'here', name: 'Here', image: 'https://example.com/a.jpg' },
    { id: 'away', name: 'Away', image: null },
  ]

  it('leaves out who is in the call and puts those with the room open first', () => {
    const result = resolveVoiceTalkBystanders({ members, seatUserIds: ['in-call'], presence: ['here', 'me'], viewerUserId: 'me' })
    expect(result.map((member) => [member.id, member.viewing])).toEqual([['me', true], ['here', true], ['away', false]])
  })

  it('always counts the viewer as having the room open', () => {
    const result = resolveVoiceTalkBystanders({ members, seatUserIds: [], presence: [], viewerUserId: 'me' })
    expect(result.find((member) => member.id === 'me')?.viewing).toBe(true)
    expect(result.find((member) => member.id === 'here')?.viewing).toBe(false)
  })

  it('shows nobody as away while the server has not reported who is here', () => {
    const result = resolveVoiceTalkBystanders({ members, seatUserIds: [], presence: null, viewerUserId: 'me' })
    expect(result.every((member) => member.viewing)).toBe(true)
  })

  it('reads the members API and drops rows without an id', () => {
    expect(parseRoomMemberSummaries({ members: [{ id: 'a', name: ' Mina ', image: '' }, { name: 'no id' }, null] }))
      .toEqual([{ id: 'a', name: 'Mina', image: null }])
    expect(parseRoomMemberSummaries(null)).toEqual([])
    expect(parseRoomMemberSummaries({ members: 'x' })).toEqual([])
  })

  it('draws them as small plain circles above the buttons, dimmed while away', () => {
    const row = panelSource.indexOf('data-qa="voice-talk-bystanders"')
    expect(row).toBeGreaterThan(0)
    expect(row).toBeLessThan(panelSource.indexOf('data-qa="voice-talk-mic-toggle"'))
    const markup = panelSource.slice(row, row + 1200)
    expect(markup).toContain('h-6 w-6')
    expect(markup).toContain("member.viewing ? '' : 'opacity-35'")
    expect(markup).not.toContain('LanguageFlag')
  })
})

describe('voice talk dialogs and the ad banner', () => {
  it('hides the native banner while the start/join dialog, the leave dialog or the incoming card is up', () => {
    expect(panelSource).toContain('const dialogOpen = startPrompt || confirmLeave || incomingOffered')
    expect(panelSource).toContain('useNativeBannerSuppression(dialogOpen)')
    // Before the early return, so it also holds while the panel itself is not shown.
    expect(panelSource.indexOf('useNativeBannerSuppression(dialogOpen)')).toBeLessThan(panelSource.indexOf('if (!joined && !error) {'))
  })
})

describe('a call left behind by an app restart', () => {
  const call = { id: 'c1', participants: [{ userId: 'me' }, { userId: 'other' }] }

  it('is one this phone remembers, the server still lists me in, and the app is not in now', () => {
    expect(isAbandonedJoinedCall({ rememberedCallId: 'c1', call, viewerUserId: 'me', joinedNow: false })).toBe(true)
  })

  it('is not one the app is still connected to (the page reloaded, the call went on)', () => {
    expect(isAbandonedJoinedCall({ rememberedCallId: 'c1', call, viewerUserId: 'me', joinedNow: true })).toBe(false)
  })

  it('is not another call, a call I am not listed in, or a call this phone never joined', () => {
    expect(isAbandonedJoinedCall({ rememberedCallId: 'c0', call, viewerUserId: 'me', joinedNow: false })).toBe(false)
    expect(isAbandonedJoinedCall({ rememberedCallId: 'c1', call: { id: 'c1', participants: [{ userId: 'other' }] }, viewerUserId: 'me', joinedNow: false })).toBe(false)
    // My other phone is in it; this one never was.
    expect(isAbandonedJoinedCall({ rememberedCallId: null, call, viewerUserId: 'me', joinedNow: false })).toBe(false)
    expect(isAbandonedJoinedCall({ rememberedCallId: 'c1', call: null, viewerUserId: 'me', joinedNow: false })).toBe(false)
  })

  it('is left on the server and emptied from its seat as soon as the room opens', () => {
    const handler = panelSource.slice(panelSource.indexOf("if (detail.type === 'status') {"), panelSource.indexOf("} else if (detail.type === 'room')"))
    expect(handler).toContain('/voice/leave')
    expect(handler).toContain("method: 'POST'")
    expect(handler).toContain('writeJoinedCallMarker(conversationId, null)')
    expect(handler).toContain('participants: detail.call.participants.filter((p) => p.userId !== viewerUserId)')
  })

  it('remembers a call once connected and forgets it on leaving', () => {
    expect(panelSource).toContain('if (connected && liveCallId) writeJoinedCallMarker(conversationId, liveCallId)')
    expect(panelSource).toContain("if (detail.phase === 'left') writeJoinedCallMarker(conversationId, null)")
  })
})

describe('who started the call, on the incoming card', () => {
  it('is the starter the server names, not the first person in the list', () => {
    expect(panelSource).toContain('call?.startedBy')
    expect(panelSource).toContain('call.startedBy.name ?? call.participants.find((p) => p.userId === call.startedBy?.userId)?.name')
    expect(panelSource).not.toContain("const starterName = (call?.participants[0]?.name || '').trim()")
  })

  it('says it is my own call when I started it', () => {
    expect(panelSource).toContain('const startedByViewer = !!viewerUserId && call?.startedBy?.userId === viewerUserId')
    expect(copySource).toContain("startedByMe: '내가 시작한 보이스톡이 진행 중입니다.'")
    expect(panelSource).toContain('const incomingTitle = startedByViewer ? copy.startedByMe')
  })
})

describe('folded panel', () => {
  it('unfolds on a tap anywhere on its row, and the chevron does not toggle it twice', () => {
    expect(panelSource).toContain("onClick={folded ? () => setFolded(false) : undefined}")
    const chevron = panelSource.slice(panelSource.indexOf('aria-label={folded ? copy.open : copy.fold}') - 300, panelSource.indexOf('aria-label={folded ? copy.open : copy.fold}'))
    expect(chevron).toContain('event.stopPropagation()')
  })
})

describe('both voice talk entry points', () => {
  it('the phone button and the keyboard-mode + menu item share one handler: leave during a call, start or join otherwise', () => {
    const handler = liveDemoSource.slice(liveDemoSource.indexOf('const handleVoiceTalkPress = useCallback'), liveDemoSource.indexOf('const voiceTalkMenuItem = useMemo'))
    expect(handler).toContain("resolveVoiceTalkButtonPress(voiceTalkState) === 'confirm_leave'")
    expect(handler).toContain('setVoiceTalkLeaveSignal((n) => n + 1)')
    expect(handler).toContain('setVoiceTalkOpenSignal((n) => n + 1)')
    expect(liveDemoSource).toContain('onSelect: handleVoiceTalkPress,')
    expect(liveDemoSource).toContain('onPress={handleVoiceTalkPress}')
  })
})

describe('the call mic outlives the room screen', () => {
  it('is switched only by the button, never when the room screen opens', () => {
    expect(liveDemoSource).not.toContain('setVoiceTalkMic(resolveVoiceTalkMic({ listenOnly: voiceTalkListenOnly }))')
    const handler = liveDemoSource.slice(liveDemoSource.indexOf('const handleVoiceTalkListenOnlyChange = useCallback'), liveDemoSource.indexOf('// A new call starts with the mic on'))
    expect(handler).toContain('setVoiceTalkMic(resolveVoiceTalkMic({ listenOnly }))')
    expect(liveDemoSource).toContain('onListenOnlyChange={handleVoiceTalkListenOnlyChange}')
  })

  it('shows what the app reports when the room opens again (a muted call stays muted)', () => {
    expect(liveDemoSource).toContain('onListenOnlySync={setVoiceTalkListenOnly}')
    expect(panelSource).toContain("if (detail.snapshot && typeof detail.snapshot.micOn === 'boolean') onListenOnlySyncRef.current?.(!detail.snapshot.micOn)")
  })
})

describe('seats shown', () => {
  it('draws the people in the call and one open seat, not every empty seat', () => {
    expect(visibleVoiceTalkSeats(['a', 'b'], 8)).toEqual(['a', 'b', null])
    expect(visibleVoiceTalkSeats([], 8)).toEqual([null])
    expect(visibleVoiceTalkSeats(['1', '2', '3', '4', '5', '6', '7', '8'], 8)).toHaveLength(8)
    expect(visibleVoiceTalkSeats(['1', '2', '3', '4', '5', '6', '7', '8'], 8)).not.toContain(null)
    expect(panelSource).not.toContain('Array.from({ length: MAX_SEATS }')
  })

  it('keeps the leave button gray, so the red mic-on is the only red', () => {
    const leaveButton = panelSource.slice(panelSource.indexOf('data-qa="voice-talk-leave"'), panelSource.indexOf('{copy.leave}', panelSource.indexOf('data-qa="voice-talk-leave"')))
    expect(leaveButton).toContain('bg-gray-100')
    expect(leaveButton).not.toContain('rose')
  })
})
