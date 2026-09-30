import type { Utterance } from './ChatBubble'
import { compareUtteranceOrder } from './utterance-order'
import {
  EARPHONE_MODE_AUDIO_TIMEOUT_MS,
  EARPHONE_MODE_HISTORY_CLOCK_SKEW_MS,
  EARPHONE_MODE_PREFETCH_LIMIT,
  EARPHONE_MODE_READ_OWN_MESSAGES,
  EARPHONE_MODE_STALL_TIMEOUT_MS,
  buildEarphoneModeProgressSignature,
  classifyEarphoneModeUtterance,
  createEarphoneModeWatermark,
  isEarphoneModeCandidate,
  isEarphoneModeUtteranceSettled,
  type EarphoneModeReadContext,
  type EarphoneModeReadTarget,
  type EarphoneModeWatermark,
} from './live-phone-demo.earphone-mode.logic'

export type EarphoneAutoReadSnapshot = {
  // Scope of one watermark; a new key starts a new one (per conversation).
  conversationKey: string
  committed: readonly Utterance[]
  // Rows still being spoken (own pending turns, counterpart previews).
  drafts: readonly Utterance[]
  // The session's one read language (L): only translations into it are read.
  read: EarphoneModeReadContext
  viewerUserId: string | null
}

export type EarphoneAutoReadDispatchItem = EarphoneModeReadTarget & { audioBlob: Blob }

export type EarphoneAutoReadControllerOptions = {
  now: () => number
  setTimer: (callback: () => void, delayMs: number) => unknown
  clearTimer: (handle: unknown) => void
  synthesize: (target: EarphoneModeReadTarget, signal: AbortSignal) => Promise<Blob | null>
  // The room's player has nothing to play and no manual request in flight.
  isEngineIdle: () => boolean
  // Checked synchronously right before a clip is handed over, so a gate that
  // just closed can never start one more clip on the speaker.
  canDispatch: () => boolean
  dispatch: (item: EarphoneAutoReadDispatchItem) => void
  onQueuedPlaybackKeysChange?: (playbackKeys: readonly string[]) => void
  readOwnMessages?: boolean
  stallTimeoutMs?: number
  audioTimeoutMs?: number
  prefetchLimit?: number
  historyClockSkewMs?: number
}

export type EarphoneAutoReadCandidateStatus = 'waiting' | 'ready' | 'dispatched' | 'skipped'

type Candidate = {
  utteranceId: string
  order: { id: string, createdAtMs?: number, serverCreatedAtMs?: number, serverMessageId?: string }
  status: EarphoneAutoReadCandidateStatus
  signature: string
  lastProgressAtMs: number
  target: EarphoneModeReadTarget | null
  audio: 'idle' | 'loading' | 'ready' | 'failed'
  audioBlob: Blob | null
  audioRequestedAtMs: number
  abort: AbortController | null
}

function pickOrder(utterance: Utterance): Candidate['order'] {
  return {
    id: utterance.id,
    createdAtMs: utterance.createdAtMs,
    serverCreatedAtMs: utterance.serverCreatedAtMs,
    serverMessageId: utterance.serverMessageId,
  }
}

// Still to be read: waiting to complete, or complete and queued.
function isOpenCandidate(candidate: Candidate): boolean {
  return candidate.status === 'waiting' || candidate.status === 'ready'
}

function readLanguageKeyOf(read: EarphoneModeReadContext): string {
  return read.readLanguage?.trim().toLowerCase() ?? ''
}

// Reads every message that completes after a rising edge, in the order the
// messages STARTED (compareUtteranceOrder, evaluated at dequeue time because
// the server-reserved start can reach a row late), and only its translation
// into the session's read language. A candidate that started earlier but is
// still incomplete holds the ones behind it until it completes, disappears,
// or shows no progress for the stall timeout. Audio is prefetched as soon as
// a candidate completes; playback stays strictly in order.
export class EarphoneAutoReadController {
  private readonly options: EarphoneAutoReadControllerOptions
  private armed = false
  private conversationKey = ''
  private readLanguageKey = ''
  private watermark: EarphoneModeWatermark | null = null
  private candidates = new Map<string, Candidate>()
  private timer: unknown = null
  private lastQueuedKeys = ''

  constructor(options: EarphoneAutoReadControllerOptions) {
    this.options = options
  }

  isArmed(): boolean {
    return this.armed
  }

  // Rising edge: everything committed and settled now is existing and never
  // read. A committed row whose translation is still pending counts like a
  // draft: it is read once it completes.
  arm(snapshot: EarphoneAutoReadSnapshot): void {
    this.resetCandidates()
    this.armed = true
    this.conversationKey = snapshot.conversationKey
    this.readLanguageKey = readLanguageKeyOf(snapshot.read)
    const readOwnMessages = this.options.readOwnMessages ?? EARPHONE_MODE_READ_OWN_MESSAGES
    this.watermark = createEarphoneModeWatermark({
      committed: snapshot.committed,
      drafts: snapshot.drafts,
      isCommittedSettled: (utterance) => isEarphoneModeUtteranceSettled({
        utterance,
        read: snapshot.read,
        viewerUserId: snapshot.viewerUserId,
        readOwnMessages,
      }),
      nowMs: this.options.now(),
    })
    this.reconcile(snapshot)
    this.pump()
  }

  // Falling edge: drop every auto item. The caller stops the current clip.
  disarm(): void {
    this.armed = false
    this.watermark = null
    this.conversationKey = ''
    this.readLanguageKey = ''
    this.resetCandidates()
    this.emitQueuedPlaybackKeys()
  }

  update(snapshot: EarphoneAutoReadSnapshot): void {
    if (!this.armed) return
    if (snapshot.conversationKey !== this.conversationKey) {
      this.arm(snapshot)
      return
    }
    this.applyReadLanguage(snapshot.read)
    this.reconcile(snapshot)
    this.pump()
  }

  // A manual tap on a bubble whose clip is queued plays it now; do not read
  // it a second time later.
  consumePlaybackKey(playbackKey: string): void {
    let changed = false
    for (const candidate of this.candidates.values()) {
      if (candidate.status !== 'ready' || candidate.target?.playbackKey !== playbackKey) continue
      this.finishCandidate(candidate, 'dispatched')
      changed = true
    }
    if (changed) this.emitQueuedPlaybackKeys()
  }

  getQueuedPlaybackKeys(): string[] {
    return this.sortedOpenCandidates()
      .filter((candidate) => candidate.status === 'ready' && candidate.audio !== 'failed' && candidate.target)
      .map((candidate) => candidate.target!.playbackKey)
  }

  getCandidateStatus(utteranceId: string): EarphoneAutoReadCandidateStatus | undefined {
    return this.candidates.get(utteranceId)?.status
  }

  // Prefetch, drop what timed out, hand the next clip to an idle player, and
  // schedule a wake-up for the head's deadline.
  pump(): void {
    this.clearTimer()
    if (!this.armed) return

    const now = this.options.now()
    const audioTimeoutMs = this.options.audioTimeoutMs ?? EARPHONE_MODE_AUDIO_TIMEOUT_MS
    const stallTimeoutMs = this.options.stallTimeoutMs ?? EARPHONE_MODE_STALL_TIMEOUT_MS

    for (const candidate of this.candidates.values()) {
      if (candidate.audio === 'loading' && now - candidate.audioRequestedAtMs >= audioTimeoutMs) {
        candidate.abort?.abort()
        candidate.abort = null
        candidate.audio = 'failed'
      }
    }
    this.startPrefetches(now)

    let nextDeadlineMs: number | null = null
    for (const candidate of this.sortedOpenCandidates()) {
      if (candidate.status === 'waiting') {
        const stallDeadlineMs = candidate.lastProgressAtMs + stallTimeoutMs
        if (now >= stallDeadlineMs) {
          this.finishCandidate(candidate, 'skipped')
          continue
        }
        nextDeadlineMs = stallDeadlineMs
        break
      }

      // status === 'ready'
      if (candidate.audio === 'failed') {
        this.finishCandidate(candidate, 'skipped')
        continue
      }
      if (candidate.audio === 'loading') {
        nextDeadlineMs = candidate.audioRequestedAtMs + audioTimeoutMs
        break
      }
      if (candidate.audio === 'ready' && candidate.audioBlob && candidate.target) {
        if (this.options.isEngineIdle() && this.options.canDispatch()) {
          const item: EarphoneAutoReadDispatchItem = { ...candidate.target, audioBlob: candidate.audioBlob }
          this.finishCandidate(candidate, 'dispatched')
          this.emitQueuedPlaybackKeys()
          this.options.dispatch(item)
        }
        // Either handed over or waiting for the player to go idle, which
        // pumps again.
        break
      }
      // audio 'idle': waiting for a prefetch slot. Wake up when the oldest
      // request in flight times out, so a hung request cannot keep its slot.
      nextDeadlineMs = this.earliestAudioDeadlineMs(audioTimeoutMs)
      break
    }

    this.emitQueuedPlaybackKeys()
    if (nextDeadlineMs !== null && this.armed) {
      this.scheduleTimer(Math.max(0, nextDeadlineMs - now))
    }
  }

  private reconcile(snapshot: EarphoneAutoReadSnapshot): void {
    const watermark = this.watermark
    if (!watermark) return

    const now = this.options.now()
    const committedIds = new Set(snapshot.committed.map((utterance) => utterance.id))
    const present = new Set<string>()
    const rows: Array<{ utterance: Utterance, isDraft: boolean }> = [
      ...snapshot.committed.map((utterance) => ({ utterance, isDraft: false })),
      ...snapshot.drafts
        .filter((utterance) => !committedIds.has(utterance.id))
        .map((utterance) => ({ utterance, isDraft: true })),
    ]

    for (const { utterance, isDraft } of rows) {
      present.add(utterance.id)
      let candidate = this.candidates.get(utterance.id)
      if (!candidate) {
        if (!isEarphoneModeCandidate(
          watermark,
          utterance,
          this.options.historyClockSkewMs ?? EARPHONE_MODE_HISTORY_CLOCK_SKEW_MS,
        )) {
          continue
        }
        candidate = {
          utteranceId: utterance.id,
          order: pickOrder(utterance),
          status: 'waiting',
          signature: buildEarphoneModeProgressSignature(utterance, isDraft),
          lastProgressAtMs: now,
          target: null,
          audio: 'idle',
          audioBlob: null,
          audioRequestedAtMs: 0,
          abort: null,
        }
        this.candidates.set(utterance.id, candidate)
      }
      if (candidate.status === 'dispatched' || candidate.status === 'skipped') continue

      candidate.order = pickOrder(utterance)
      const signature = buildEarphoneModeProgressSignature(utterance, isDraft)
      if (signature !== candidate.signature) {
        candidate.signature = signature
        candidate.lastProgressAtMs = now
      }
      if (candidate.status !== 'waiting') continue

      const classified = classifyEarphoneModeUtterance({
        utterance,
        isDraft,
        read: snapshot.read,
        viewerUserId: snapshot.viewerUserId,
        readOwnMessages: this.options.readOwnMessages ?? EARPHONE_MODE_READ_OWN_MESSAGES,
      })
      if (classified.state === 'ready') {
        candidate.status = 'ready'
        candidate.target = classified.target
      } else if (classified.state === 'unreadable') {
        this.finishCandidate(candidate, 'skipped')
      }
    }

    // Removed or cancelled before being read: stop waiting for it.
    for (const candidate of this.candidates.values()) {
      if ((candidate.status === 'waiting' || candidate.status === 'ready') && !present.has(candidate.utteranceId)) {
        this.finishCandidate(candidate, 'skipped')
      }
    }
  }

  // The read language changed (picked in the notice, or fallen back to the
  // room default): everything still queued is classified again and read in
  // the new language, or skipped when it has none. What was already read or
  // skipped stays so.
  private applyReadLanguage(read: EarphoneModeReadContext): void {
    const readLanguageKey = readLanguageKeyOf(read)
    if (readLanguageKey === this.readLanguageKey) return
    this.readLanguageKey = readLanguageKey
    const now = this.options.now()
    for (const candidate of this.candidates.values()) {
      if (!isOpenCandidate(candidate)) continue
      candidate.abort?.abort()
      candidate.abort = null
      candidate.status = 'waiting'
      candidate.target = null
      candidate.audio = 'idle'
      candidate.audioBlob = null
      // Waiting for the new language's translation starts now.
      candidate.lastProgressAtMs = now
    }
  }

  private startPrefetches(now: number): void {
    const limit = Math.max(1, this.options.prefetchLimit ?? EARPHONE_MODE_PREFETCH_LIMIT)
    const open = this.sortedOpenCandidates()
    // Only open candidates hold a slot: a finished one has aborted its request.
    let inFlight = open.filter((candidate) => candidate.audio === 'loading').length
    for (const candidate of open) {
      if (inFlight >= limit) return
      if (candidate.status !== 'ready' || candidate.audio !== 'idle' || !candidate.target) continue
      this.requestAudio(candidate, now)
      inFlight += 1
    }
  }

  private earliestAudioDeadlineMs(audioTimeoutMs: number): number | null {
    let earliest: number | null = null
    for (const candidate of this.candidates.values()) {
      if (!isOpenCandidate(candidate) || candidate.audio !== 'loading') continue
      const deadlineMs = candidate.audioRequestedAtMs + audioTimeoutMs
      if (earliest === null || deadlineMs < earliest) earliest = deadlineMs
    }
    return earliest
  }

  private requestAudio(candidate: Candidate, now: number): void {
    const target = candidate.target
    if (!target) return
    const abort = new AbortController()
    candidate.abort = abort
    candidate.audio = 'loading'
    candidate.audioRequestedAtMs = now

    let request: Promise<Blob | null>
    try {
      request = this.options.synthesize(target, abort.signal)
    } catch {
      request = Promise.resolve(null)
    }
    void request
      .catch(() => null)
      .then((blob) => {
        if (candidate.abort !== abort || abort.signal.aborted) return
        candidate.abort = null
        if (candidate.status !== 'ready') return
        if (blob && blob.size > 0) {
          candidate.audio = 'ready'
          candidate.audioBlob = blob
        } else {
          candidate.audio = 'failed'
        }
        this.pump()
      })
  }

  private finishCandidate(candidate: Candidate, status: 'dispatched' | 'skipped'): void {
    candidate.status = status
    // Abort a prefetch still in flight and release its slot: a finished
    // candidate holds neither audio nor a request.
    candidate.abort?.abort()
    candidate.abort = null
    candidate.audio = 'idle'
    candidate.audioBlob = null
  }

  private sortedOpenCandidates(): Candidate[] {
    return [...this.candidates.values()]
      .filter(isOpenCandidate)
      .sort((left, right) => compareUtteranceOrder(left.order, right.order))
  }

  private resetCandidates(): void {
    this.clearTimer()
    for (const candidate of this.candidates.values()) {
      candidate.abort?.abort()
      candidate.abort = null
      candidate.audioBlob = null
    }
    this.candidates = new Map()
  }

  private emitQueuedPlaybackKeys(): void {
    const keys = this.getQueuedPlaybackKeys()
    const serialized = keys.join('\n')
    if (serialized === this.lastQueuedKeys) return
    this.lastQueuedKeys = serialized
    this.options.onQueuedPlaybackKeysChange?.(keys)
  }

  private scheduleTimer(delayMs: number): void {
    this.clearTimer()
    this.timer = this.options.setTimer(() => {
      this.timer = null
      // Stall and audio-timeout checks run in pump().
      this.pump()
    }, delayMs)
  }

  private clearTimer(): void {
    if (this.timer === null) return
    this.options.clearTimer(this.timer)
    this.timer = null
  }
}
