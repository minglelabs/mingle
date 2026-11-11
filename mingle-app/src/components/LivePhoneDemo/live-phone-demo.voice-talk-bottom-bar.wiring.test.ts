import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveLivePhoneDemoRoomManagementCopy } from './live-phone-demo.room-management-copy'
const voiceCopySource = readFileSync(new URL('../../i18n/voice-talk-copy.ts', import.meta.url), 'utf8')

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
    expect(voiceBar).toContain('onPress={handleVoiceTalkPress}')
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

describe('voice talk and STT are separate switches', () => {
  const panelSource = readFileSync(new URL('./VoiceTalkPanel.tsx', import.meta.url), 'utf8')

  it('keeps the call panel free of its own text; its mic button is the listen-only switch', () => {
    // No caption list of its own (what people say is the room's messages); it only says when captions are off.
    expect(panelSource).not.toContain('captions.map')
    expect(panelSource).not.toContain('snapshot.captions')
    expect(panelSource).not.toContain('toggleMic')
    expect(panelSource).toContain('export function setVoiceTalkMic(on: boolean)')
    expect(panelSource).toContain('data-qa="voice-talk-mic-toggle"')
  })

  it('locks Start/Stop and the speaker button in a call, and runs no speech-to-text of its own there', () => {
    expect(liveDemoSource).toContain('if (voiceTalkState.joined) return\n')
    expect(liveDemoSource).toContain('disabled={(isPreparingStart && !isConnecting) || voiceTalkState.joined}')
    expect(liveDemoSource).toContain('disabled={voiceTalkState.joined}')
    expect(liveDemoSource).toContain('if (voiceTalkState.joined && isSttSessionRunning) void handleStopRecording()')
    expect(liveDemoSource).not.toContain('shouldTranscribeForVoiceTalk')
    expect(liveDemoSource).toContain('suppressLivePreview: voiceTalkState.joined,')
  })

  it('drives the call mic from the listen-only switch alone, only when it is pressed', () => {
    const block = between(liveDemoSource, '// A voice talk takes over the room', 'const confirmScreenCaptureNotice')
    expect(block).toContain('setVoiceTalkMic(resolveVoiceTalkMic({ listenOnly }))')
    expect(block).not.toContain('useEffect(() => {\n    if (!voiceTalkConnected) return')
  })
})

describe('starting and joining a voice talk', () => {
  const panelSource = readFileSync(new URL('./VoiceTalkPanel.tsx', import.meta.url), 'utf8')
  const composerSource = readFileSync(new URL('./ConversationImageComposer.tsx', import.meta.url), 'utf8')

  it('asks before starting or joining, low on the screen, and has no Join / Close row in the panel', () => {
    expect(panelSource).toContain('openSignal?: number')
    // Not while the incoming card is up: that card is already the question.
    expect(panelSource).toContain('if (openSignal && !joined && !incomingOffered) setStartPrompt(true)')
    expect(panelSource.indexOf('const incomingOffered =')).toBeLessThan(panelSource.indexOf('if (openSignal && !joined && !incomingOffered)'))
    expect(panelSource).toContain('data-qa="voice-talk-start-confirm"')
    expect(voiceCopySource).toContain("startTitle: '대화방에 보이스톡을 시작하시겠습니까?'")
    const dialog = panelSource.slice(panelSource.indexOf('const startDialog ='), panelSource.indexOf('const incoming ='))
    expect(dialog).toContain('items-end')
    expect(dialog).toContain('onClick={join}')
    expect(panelSource).not.toContain('data-qa="voice-talk-join"')
    expect(panelSource).not.toContain('data-qa="voice-talk-dismiss"')
  })

  it('shows the panel only for a call this phone is in', () => {
    expect(panelSource).toContain('if (!joined && !error) {\n    return <>{startDialog}{incomingCard}</>')
  })

  it('offers a call someone else started once, with Decline, and not again after declining', () => {
    expect(panelSource).toContain('data-qa="voice-talk-incoming"')
    expect(panelSource).toContain('data-qa="voice-talk-incoming-decline"')
    expect(panelSource).toContain('data-qa="voice-talk-incoming-join"')
    expect(panelSource).toContain('const incomingOffered = live && !joined && !viewerInCall && call?.id !== declinedCallId')
    expect(panelSource).toContain('const incoming = incomingOffered && !startPrompt')
    // The account that started it (or is in it on another phone) is not offered its own call.
    expect(panelSource).toContain('const viewerInCall = !!viewerUserId && !!call?.participants.some((p) => p.userId === viewerUserId)')
    expect(panelSource).toContain('if (call) setDeclinedCallId(call.id)')
  })

  it('puts a voice talk row in the keyboard-mode + menu', () => {
    expect(composerSource).toContain('data-qa="live-demo-voice-talk-menu-item"')
    expect(liveDemoSource).toContain('voiceTalk={voiceTalkMenuItem}')
    expect(liveDemoSource).toContain('label: roomManagementCopy.voiceTalkMenuItemLabel')
  })
})
