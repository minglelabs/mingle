import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveLivePhoneDemoRoomManagementCopy } from './live-phone-demo.room-management-copy'

const liveDemoSource = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')
const copySource = readFileSync(new URL('./live-phone-demo.room-management-copy.ts', import.meta.url), 'utf8')

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('voice talk button in the bottom bar', () => {
  it('sits in the bottom-left cell instead of the usage counters', () => {
    const voiceBar = between(liveDemoSource, 'key="default-bottom-bar"', 'data-qa="live-demo-mic-button"')
    expect(voiceBar).toContain('<VoiceTalkButton')
    expect(voiceBar).toContain("headerMode === 'conversation' && conversationId && voiceTalkAvailable")
    expect(voiceBar).toContain('setVoiceTalkOpenSignal((n) => n + 1)')
    expect(voiceBar).toContain('setVoiceTalkLeaveSignal((n) => n + 1)')
    expect(voiceBar).not.toContain('storedMessageCountLabel')
    expect(voiceBar).not.toContain('formatLivePhoneDemoUsageDuration')
  })

  it('is rendered only once, not in the header', () => {
    expect(liveDemoSource.split('<VoiceTalkButton').length - 1).toBe(1)
    expect(liveDemoSource).not.toContain('VoiceTalkHeaderButton')
  })

  it('shows usage time and message count in the menu usage row', () => {
    const usageRow = between(liveDemoSource, 'data-qa="live-demo-menu-usage"', '{textSizeLabel}')
    expect(usageRow).toContain('roomManagementCopy.usageMenuItemLabel')
    expect(usageRow).toContain('formatLivePhoneDemoUsageDuration(usageSec)')
    expect(usageRow).toContain('formatLivePhoneDemoUsageDuration(remainingSec)')
    expect(usageRow).toContain('{storedMessageCountLabel}')
  })

  it('has a usage label for every locale', () => {
    const labelCount = copySource.split('    usageMenuItemLabel:').length - 1
    const localeCount = copySource.split('    defaultDisplayLanguageMenuItemLabel:').length - 1
    expect(labelCount).toBe(localeCount)
    expect(resolveLivePhoneDemoRoomManagementCopy('ko').usageMenuItemLabel).toBe('사용량')
    expect(resolveLivePhoneDemoRoomManagementCopy('en').usageMenuItemLabel).toBe('Usage')
  })
})

describe('voice talk and STT share one mic', () => {
  const panelSource = readFileSync(new URL('./VoiceTalkPanel.tsx', import.meta.url), 'utf8')

  it('keeps the call panel free of its own text and mic button', () => {
    expect(panelSource).not.toContain('captions')
    expect(panelSource).not.toContain('toggleMic')
    expect(panelSource).toContain('export function setVoiceTalkMic(on: boolean)')
  })

  it('starts STT when a call connects and stops only what the call started', () => {
    const block = between(liveDemoSource, 'const voiceTalkConnected = voiceTalkState.connected', 'const confirmScreenCaptureNotice')
    expect(block).toContain('voiceTalkStartedSttRef.current = true\n        void handleStartRecording()')
    expect(block).toContain('if (voiceTalkStartedSttRef.current && isSttSessionRunning) void handleStopRecording()')
  })

  it('drives the call mic from the STT session state and the listen-only switch', () => {
    const block = between(liveDemoSource, 'const voiceTalkConnected = voiceTalkState.connected', 'const confirmScreenCaptureNotice')
    expect(block).toContain('sttBusy: isSttSessionRunning || isPreparingStart || startPreparationInFlightRef.current,')
    expect(block).toContain('listenOnly: voiceTalkListenOnly,')
  })
})

describe('voice talk panel opens before joining', () => {
  const panelSource = readFileSync(new URL('./VoiceTalkPanel.tsx', import.meta.url), 'utf8')
  const composerSource = readFileSync(new URL('./ConversationImageComposer.tsx', import.meta.url), 'utf8')

  it('only shows the panel on the button; joining is the panel Join button', () => {
    expect(panelSource).toContain('openSignal?: number')
    expect(panelSource).not.toContain('startSignal')
    expect(panelSource).toContain('data-qa="voice-talk-join"')
    expect(panelSource).toContain('onClick={join}')
  })

  it('offers Decline for an incoming call and hides that call until a new one', () => {
    expect(panelSource).toContain('data-qa="voice-talk-dismiss"')
    expect(panelSource).toContain('{live ? copy.decline : copy.close}')
    expect(panelSource).toContain('const incoming = live && call?.id !== declinedCallId')
  })

  it('puts a voice talk row in the keyboard-mode + menu', () => {
    expect(composerSource).toContain('data-qa="live-demo-voice-talk-menu-item"')
    expect(liveDemoSource).toContain('voiceTalk={voiceTalkMenuItem}')
    expect(liveDemoSource).toContain('label: roomManagementCopy.voiceTalkMenuItemLabel')
  })
})
