// Web handling of the native TTS channel (`mingle:native-tts`): which events
// belong to the clip in flight, and in what order the room reacts. Kept pure so
// the ordering that keeps auto clips off the speaker is testable.

export type NativeTtsEventDetail = {
  type: string
  playbackId?: unknown
  utteranceId?: unknown
  reason?: unknown
}

export type NativeTtsActiveClip = {
  // The playbackId posted with `native_tts_play`; null when no clip is in
  // flight (never posted, or already stopped / finished / given up on).
  playbackId: string | null
  playbackKey: string | null
}

export type NativeTtsEventHandlers = {
  // Current clip ended, errored or was stopped: clear it (no queue step yet).
  finishCurrentClip: () => void
  // Current clip's audio really started (contract A.3).
  markStarted: (playbackKey: string) => void
  // `tts_stopped` with reason `earphones_disconnected` (contract A.5): no
  // earphone output is left, whether or not the clip ever started.
  markEarphonesDisconnected: () => void
  // Let the player move on. Runs last, after the earphone gate was updated.
  advanceQueue: () => void
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function isNativeTtsEventForActiveClip(
  detail: Pick<NativeTtsEventDetail, 'playbackId' | 'utteranceId'>,
  active: NativeTtsActiveClip,
): boolean {
  const playbackId = readString(detail.playbackId)
  const utteranceId = readString(detail.utteranceId)
  // An id the room no longer tracks belongs to a clip it already stopped or
  // gave up on; with auto-read the next clip can already be in flight.
  if (playbackId) return active.playbackId === playbackId
  if (utteranceId && active.playbackKey) return active.playbackKey === utteranceId
  // Id-less events come only from shells that predate playback ids.
  return true
}

export function applyNativeTtsEvent(
  detail: unknown,
  active: NativeTtsActiveClip,
  handlers: NativeTtsEventHandlers,
): void {
  if (!detail || typeof detail !== 'object') return
  const event = detail as NativeTtsEventDetail

  if (event.type === 'tts_started') {
    const playbackId = readString(event.playbackId)
    const utteranceId = readString(event.utteranceId)
    const isActiveStart = playbackId
      ? active.playbackId === playbackId
      : Boolean(utteranceId) && active.playbackKey === utteranceId
    if (isActiveStart && active.playbackKey) handlers.markStarted(active.playbackKey)
    return
  }

  if (event.type === 'tts_ended' || event.type === 'tts_error') {
    if (!isNativeTtsEventForActiveClip(event, active)) return
    handlers.finishCurrentClip()
    handlers.advanceQueue()
    return
  }

  if (event.type === 'tts_stopped') {
    const isActiveClip = isNativeTtsEventForActiveClip(event, active)
    if (isActiveClip) handlers.finishCurrentClip()
    // After the clip is cleared (so the falling edge finds nothing left to
    // stop) and before the queue moves (so it sees the gate closed).
    if (event.reason === 'earphones_disconnected') handlers.markEarphonesDisconnected()
    if (isActiveClip) handlers.advanceQueue()
  }
}
