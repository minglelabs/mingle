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
    expect(voiceBar).toContain('setVoiceTalkStartSignal((n) => n + 1)')
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
