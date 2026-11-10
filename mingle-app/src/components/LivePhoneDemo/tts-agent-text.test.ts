import { describe, expect, it } from 'vitest'
import { sanitizeTtsAgentText, TtsAgentTextScheduler } from './tts-agent-text'

function harness() {
  let now = 0
  let tick: (() => void) | null = null
  const sent: Array<[string, boolean]> = []
  const scheduler = new TtsAgentTextScheduler({
    send: (text, endOfSegment) => sent.push([text, endOfSegment]),
    now: () => now,
    setInterval: (callback) => { tick = callback; return 1 },
    clearInterval: () => { tick = null },
    leadMs: 700,
  })
  return {
    scheduler,
    sent,
    advance(ms: number) {
      now += ms
      tick?.()
    },
    get timerRunning() { return tick !== null },
  }
}

describe('TtsAgentTextScheduler', () => {
  it('sends each character about 700ms before it is heard', () => {
    const h = harness()
    // 10 characters over 1000ms: 100ms per character.
    h.scheduler.start('clip-1', '0123456789', 1000)
    expect(h.sent).toEqual([['0123456', false]])
    h.advance(100)
    expect(h.sent.at(-1)).toEqual(['7', false])
    h.advance(200)
    expect(h.sent.map(([text]) => text).join('')).toBe('0123456789')
    expect(h.timerRunning).toBe(false)
  })

  it('closes the turn when the clip ends, sending what was left', () => {
    const h = harness()
    h.scheduler.start('clip-1', 'Which one would you like?', 5000)
    h.scheduler.finish('clip-1')
    expect(h.sent.map(([text]) => text).join('')).toBe('Which one would you like?')
    expect(h.sent.at(-1)?.[1]).toBe(true)
    expect(h.sent.filter(([, end]) => end)).toHaveLength(1)
  })

  it('on a stop, sends only what was heard and drops the rest', () => {
    const h = harness()
    h.scheduler.start('clip-1', '0123456789', 10_000) // 1s per character, lead 0.7s
    h.advance(3_000)
    expect(h.sent.map(([text]) => text).join('')).toBe('012')
    h.scheduler.interrupt()
    expect(h.sent.at(-1)).toEqual(['', true])
    expect(h.sent.map(([text]) => text).join('')).toBe('012')
    h.advance(10_000)
    expect(h.sent).toHaveLength(2)
  })

  it('a new clip closes the previous turn first', () => {
    const h = harness()
    h.scheduler.start('clip-1', 'abcdefghij', 10_000)
    h.advance(5_000)
    h.scheduler.start('clip-2', 'xyz', 300)
    const ends = h.sent.filter(([, end]) => end)
    expect(ends).toHaveLength(1)
    expect(h.sent.findIndex(([, end]) => end)).toBeLessThan(h.sent.findIndex(([text]) => text.startsWith('x')))
  })

  it('ignores a repeated start and a finish for another clip', () => {
    const h = harness()
    h.scheduler.start('clip-1', 'abc', 1_000)
    h.scheduler.start('clip-1', 'abc', 1_000)
    h.scheduler.finish('clip-2')
    expect(h.sent.filter(([, end]) => end)).toHaveLength(0)
    expect(h.sent).toHaveLength(1)
  })

  it('does nothing for an empty sentence', () => {
    const h = harness()
    h.scheduler.start('clip-1', '<break/>', 1000)
    h.scheduler.finish('clip-1')
    expect(h.sent).toEqual([])
  })

  it('removes tags before cutting the sentence', () => {
    expect(sanitizeTtsAgentText('<speak>안녕 [laughs]하세요 *진짜*</speak>')).toBe('안녕 하세요 진짜')
  })
})
