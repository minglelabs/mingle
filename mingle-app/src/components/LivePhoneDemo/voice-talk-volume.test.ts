import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CALL_VOLUME, readCallVolume } from './VoiceTalkPanel'

const panelSource = readFileSync(new URL('./VoiceTalkPanel.tsx', import.meta.url), 'utf8')

function stubStorage(value: string | null) {
  vi.stubGlobal('window', { localStorage: { getItem: () => value, setItem: () => {} } })
}

afterEach(() => vi.unstubAllGlobals())

describe('call volume', () => {
  it('starts below full and keeps what the viewer picked', () => {
    expect(DEFAULT_CALL_VOLUME).toBeLessThan(1)
    stubStorage(null)
    expect(readCallVolume()).toBe(DEFAULT_CALL_VOLUME)
    stubStorage('0.15')
    expect(readCallVolume()).toBe(0.15)
    stubStorage('7')
    expect(readCallVolume()).toBe(1)
    stubStorage('loud')
    expect(readCallVolume()).toBe(DEFAULT_CALL_VOLUME)
  })

  it('has a slider in the call panel that goes down to silence, sent to the app and again on each connect', () => {
    expect(panelSource).toContain('data-qa="voice-talk-volume"')
    expect(panelSource).toContain('min={0}')
    expect(panelSource).toContain('if (connected) setVoiceTalkVolume(readCallVolume())')
    expect(panelSource).toContain("post({ type: 'native_voice_set', payload: { volume: Math.max(0, Math.min(1, volume)) } })")
  })
})
