// Tells the STT server which translated sentence our TTS is reading aloud, so
// Soniox (stt-rt-v6 "agent text input") can drop the echo of that voice from
// the transcript and use it as context for the user's reply.
//
// Soniox places each piece where it arrives in the audio stream, so timing is
// the alignment: send each character about LEAD ms before it is heard. TTS
// clips come whole with no word timestamps, so the position is estimated in
// proportion to the clip's length from the moment playback really started.
// https://docs.soniox.com/stt/rt/agent-text-input

export const TTS_AGENT_TEXT_LEAD_MS = 700
export const TTS_AGENT_TEXT_TICK_MS = 50

export type TtsAgentTextSend = (text: string, endOfSegment: boolean) => void

export type TtsAgentTextSchedulerOptions = {
  send: TtsAgentTextSend
  now?: () => number
  setInterval?: (callback: () => void, ms: number) => unknown
  clearInterval?: (handle: unknown) => void
  leadMs?: number
  tickMs?: number
}

// Only what is spoken: no SSML/HTML tags, expression tags or markdown marks.
// Done on the whole sentence before it is cut, so a tag is never split.
export function sanitizeTtsAgentText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[*`]/g, '')
}

type ActiveClip = {
  key: string
  chars: string[]
  durationMs: number
  startedAt: number
  sentChars: number
}

export class TtsAgentTextScheduler {
  private readonly send: TtsAgentTextSend
  private readonly now: () => number
  private readonly setTimer: (callback: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void
  private readonly leadMs: number
  private readonly tickMs: number
  private active: ActiveClip | null = null
  private timer: unknown = null

  constructor(options: TtsAgentTextSchedulerOptions) {
    this.send = options.send
    this.now = options.now ?? (() => Date.now())
    this.setTimer = options.setInterval ?? ((callback, ms) => setInterval(callback, ms))
    this.clearTimer = options.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>))
    this.leadMs = options.leadMs ?? TTS_AGENT_TEXT_LEAD_MS
    this.tickMs = options.tickMs ?? TTS_AGENT_TEXT_TICK_MS
  }

  /** The clip with this key really started playing. Repeated calls for the same clip are ignored. */
  start(key: string, text: string, durationMs: number): void {
    if (this.active?.key === key) return
    this.interrupt()
    const chars = Array.from(sanitizeTtsAgentText(text))
    if (chars.length === 0) return
    const safeDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : chars.length * 80
    this.active = { key, chars, durationMs: safeDurationMs, startedAt: this.now(), sentChars: 0 }
    this.tick()
    if (this.active) this.timer = this.setTimer(() => this.tick(), this.tickMs)
  }

  /** The clip played to the end: send what is left and close the turn. */
  finish(key?: string): void {
    const clip = this.active
    if (!clip || (key !== undefined && clip.key !== key)) return
    this.close(clip, clip.chars.length)
  }

  /** Playback stopped early: send only what was heard, then close the turn. */
  interrupt(): void {
    const clip = this.active
    if (!clip) return
    this.close(clip, this.charsAt(clip, this.now() - clip.startedAt))
  }

  dispose(): void {
    this.stopTimer()
    this.active = null
  }

  private tick(): void {
    const clip = this.active
    if (!clip) return
    const due = this.charsAt(clip, this.now() - clip.startedAt + this.leadMs)
    if (due > clip.sentChars) {
      this.send(clip.chars.slice(clip.sentChars, due).join(''), false)
      clip.sentChars = due
    }
    // Everything is out; the turn stays open until the clip ends or stops.
    if (clip.sentChars >= clip.chars.length) this.stopTimer()
  }

  private close(clip: ActiveClip, upTo: number): void {
    this.stopTimer()
    this.active = null
    const end = Math.max(clip.sentChars, upTo)
    this.send(clip.chars.slice(clip.sentChars, end).join(''), true)
  }

  private charsAt(clip: ActiveClip, elapsedMs: number): number {
    const ratio = Math.max(0, Math.min(1, elapsedMs / clip.durationMs))
    return Math.floor(clip.chars.length * ratio)
  }

  private stopTimer(): void {
    if (this.timer !== null) this.clearTimer(this.timer)
    this.timer = null
  }
}
