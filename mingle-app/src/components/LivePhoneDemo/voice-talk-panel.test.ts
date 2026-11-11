import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VoiceTalkButton, resolveVoiceTalkButtonPress, resolveVoiceTalkMic } from './VoiceTalkPanel'

const panelSource = readFileSync(new URL('./VoiceTalkPanel.tsx', import.meta.url), 'utf8')
const liveDemoSource = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')

describe('voice talk mic', () => {
  it('sends voice only while speech-to-text runs and the viewer is not listening only', () => {
    expect(resolveVoiceTalkMic({ sttBusy: true, listenOnly: false })).toBe(true)
    expect(resolveVoiceTalkMic({ sttBusy: true, listenOnly: true })).toBe(false)
    expect(resolveVoiceTalkMic({ sttBusy: false, listenOnly: false })).toBe(false)
    expect(resolveVoiceTalkMic({ sttBusy: false, listenOnly: true })).toBe(false)
  })

  it('keeps speech-to-text running while listening only (only the call mic follows the switch)', () => {
    const micEffect = liveDemoSource.slice(
      liveDemoSource.indexOf('setVoiceTalkMic(resolveVoiceTalkMic({'),
      liveDemoSource.indexOf('// A new call starts with the mic on.'),
    )
    expect(micEffect).toContain('listenOnly: voiceTalkListenOnly')
    expect(micEffect).not.toContain('handleStopRecording')
  })

  it('starts every call with the mic on', () => {
    expect(liveDemoSource).toContain('if (!voiceTalkState.joined) setVoiceTalkListenOnly(false)')
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
