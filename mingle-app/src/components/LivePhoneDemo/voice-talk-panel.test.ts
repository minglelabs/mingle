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

  it('is not moved by speech-to-text going on or off', () => {
    const micEffect = liveDemoSource.slice(
      liveDemoSource.indexOf("// The call's mic is its own switch"),
      liveDemoSource.indexOf('// Joining a call also turns speaker / earphone mode on'),
    )
    expect(micEffect).toContain('setVoiceTalkMic(resolveVoiceTalkMic({ listenOnly: voiceTalkListenOnly }))')
    expect(micEffect).toContain('}, [voiceTalkConnected, voiceTalkListenOnly])')
    expect(micEffect).not.toContain('isSttSessionRunning')
    expect(micEffect).not.toContain('handleStopRecording')
  })

  it('starts every call with the mic on', () => {
    expect(liveDemoSource).toContain('if (!voiceTalkState.joined) setVoiceTalkListenOnly(false)')
  })
})

describe('joining a call turns everything on', () => {
  const block = liveDemoSource.slice(
    liveDemoSource.indexOf('const voiceTalkConnected = voiceTalkState.connected'),
    liveDemoSource.indexOf('// Stopping STT by hand during a call'),
  )

  it('starts speech-to-text, and stops on leaving only what the call started', () => {
    expect(block).toContain('voiceTalkStartedSttRef.current = true\n        void handleStartRecording()')
    expect(block).toContain('if (voiceTalkStartedSttRef.current && isSttSessionRunning) void handleStopRecording()')
  })

  it('turns speaker mode on without starting screen recording, and off again only if the call turned it on', () => {
    expect(block).toContain('if (earphoneModeControlVisible && !getEarphoneModePreferenceSnapshot()) {')
    expect(block).toContain("setSttCaptureSourcePick('microphone')\n        writeEarphoneModeEnabled(true)")
    expect(block).toContain('if (voiceTalkStartedSpeakerModeRef.current && getEarphoneModePreferenceSnapshot()) writeEarphoneModeEnabled(false)')
    // Switched off by hand during the call: leaving does not touch it.
    expect(block).toContain('if (!earphoneModeEnabled) voiceTalkStartedSpeakerModeRef.current = false')
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
