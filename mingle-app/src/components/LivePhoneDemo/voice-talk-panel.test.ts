import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  VoiceTalkButton,
  VoiceTalkSeatView,
  parseRoomMemberSummaries,
  resolveVoiceTalkBystanders,
  resolveVoiceTalkButtonPress,
  resolveVoiceTalkMic,
} from './VoiceTalkPanel'

const panelSource = readFileSync(new URL('./VoiceTalkPanel.tsx', import.meta.url), 'utf8')
const liveDemoSource = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')

describe('voice talk mic', () => {
  it('follows only the listen-only switch', () => {
    expect(resolveVoiceTalkMic({ listenOnly: false })).toBe(true)
    expect(resolveVoiceTalkMic({ listenOnly: true })).toBe(false)
  })

  it('starts every call with the mic on', () => {
    expect(liveDemoSource).toContain('if (!voiceTalkState.joined) setVoiceTalkListenOnly(false)')
  })
})

describe('a call and speech-to-text are separate', () => {
  const block = liveDemoSource.slice(
    liveDemoSource.indexOf('// Voice talk and speech-to-text are separate features with separate switches.'),
    liveDemoSource.indexOf('const confirmScreenCaptureNotice = useCallback'),
  )

  it('never starts or stops speech-to-text when a call is joined or left', () => {
    expect(block.length).toBeGreaterThan(0)
    expect(block).not.toContain('handleStartRecording')
    expect(block).not.toContain('handleStopRecording')
    expect(block).not.toContain('isSttSessionRunning')
  })

  it('never switches speaker / earphone mode', () => {
    expect(block).not.toContain('writeEarphoneModeEnabled')
    expect(block).not.toContain('setSttCaptureSourcePick')
  })

  it('moves the call mic only by the listen-only switch', () => {
    expect(block).toContain('setVoiceTalkMic(resolveVoiceTalkMic({ listenOnly: voiceTalkListenOnly }))')
    expect(block).toContain('}, [voiceTalkConnected, voiceTalkListenOnly])')
  })

  it('tells a viewer in a call that captions and interpretation are off', () => {
    expect(liveDemoSource).toContain('captionsOn={isSttSessionRunning || isPreparingStart}')
    expect(panelSource).toContain('{joined && props.captionsOn === false ? (')
    expect(panelSource).toContain("captionsOffHint: '자막·통역은 꺼져 있어요. 켜려면 아래 시작 버튼을 누르세요.'")
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
    expect(panelSource).toContain("leaveTitle: '보이스톡에서 나가시겠습니까?'")
    expect(panelSource).toContain('data-qa="voice-talk-leave-confirm-button"')
    expect(panelSource.split("post({ type: 'native_voice_close' })").length - 1).toBe(1)
  })

  it('has a mic switch for listening only, in both languages', () => {
    expect(panelSource).toContain('data-qa="voice-talk-mic-toggle"')
    expect(panelSource).toContain("listenOnly: '듣기만 하는 중'")
    expect(panelSource).toContain("listenOnly: 'Listening only'")
  })

  it('labels the mic button with its state, not with the action', () => {
    expect(panelSource).toContain("micOnState: '마이크 켜짐'")
    expect(panelSource).toContain("micOffState: '마이크 꺼짐'")
    expect(panelSource).not.toContain('마이크 끄기')
    expect(panelSource).not.toContain('마이크 켜기')
    expect(panelSource).toContain('{listenOnly ? <><MicOff size={17} /> {copy.micOffState}</> : <><Mic size={17} /> {copy.micOnState}</>}')
  })

  it('gives the mic and leave buttons a full-height tap target and space between them', () => {
    const row = panelSource.slice(panelSource.indexOf('data-qa="voice-talk-mic-toggle"') - 400, panelSource.indexOf('data-qa="voice-talk-leave"') + 400)
    expect(row).toContain('gap-4')
    expect(row.split('h-11').length - 1).toBe(2)
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
