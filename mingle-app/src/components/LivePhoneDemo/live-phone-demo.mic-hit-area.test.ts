import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const liveDemoSource = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')
const sttSource = readFileSync(new URL('./use-realtime-stt.ts', import.meta.url), 'utf8')

describe('mic button decoration hit area', () => {
  // `animate-ping` scales its layer to 2x and the volume ripple scales with
  // loudness. Both are absolutely positioned inside the mic button, so they
  // paint above the neighbouring photo button. Without pointer-events: none a
  // photo tap during the ping cycle lands on the mic and stops STT on pointer-up.
  it('never lets the ping or ripple layers receive touches', () => {
    const decorationLines = liveDemoSource
      .split('\n')
      .filter((line) => /absolute inset-0 .*(animate-ping|bg-red-400 transition-transform)/.test(line))

    expect(decorationLines).toHaveLength(4)
    for (const line of decorationLines) {
      expect(line).toContain('pointer-events-none')
    }
  })
})

describe('stt stop source instrumentation', () => {
  it('tags mic-driven stops with the activating event', () => {
    expect(liveDemoSource).toContain("performMicAction('mic_pointerup')")
    expect(liveDemoSource).toContain("performMicAction('mic_click')")
    expect(liveDemoSource).toContain('stopSource: source')
    expect(liveDemoSource).toContain('stopSource: options?.stopSource')
  })

  it('records the stop source on stt_session_stopped for both native and socket stops', () => {
    const matches = sttSource.match(/\.\.\.\(options\?\.stopSource \? \{ source: options\.stopSource \} : \{\}\)/g) ?? []
    expect(matches).toHaveLength(2)
    expect(sttSource).toContain('stopSource: options?.stopSource,')
  })
})
