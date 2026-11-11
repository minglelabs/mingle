import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VoiceTalkButton, resolveVoiceTalkButtonPress, resolveVoiceTalkMic } from './VoiceTalkPanel'

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
  it('opens the panel before joining and asks to leave during a call', () => {
    expect(resolveVoiceTalkButtonPress({ joined: false })).toBe('open')
    expect(resolveVoiceTalkButtonPress({ joined: true })).toBe('confirm_leave')
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
  it('leaves only through the confirmation (panel button and room button alike)', () => {
    expect(panelSource).toContain('onClick={() => setConfirmLeave(true)}')
    expect(panelSource).toContain('data-qa="voice-talk-leave-confirm-button"')
    expect(panelSource.split("post({ type: 'native_voice_close' })").length - 1).toBe(1)
  })

  it('has a mic switch for listening only, in both languages', () => {
    expect(panelSource).toContain('data-qa="voice-talk-mic-toggle"')
    expect(panelSource).toContain("listenOnly: '듣기만 하는 중'")
    expect(panelSource).toContain("listenOnly: 'Listening only'")
  })
})
