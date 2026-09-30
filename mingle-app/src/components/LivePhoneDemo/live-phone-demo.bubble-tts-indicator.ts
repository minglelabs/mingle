// Single source for bubble TTS playback keys and indicator states. The room
// (LivePhoneDemo), the earphone-mode auto-read queue and ChatBubble must agree
// on these keys, or the wrong row lights up.

export type BubbleTtsPlaybackKind = 'original' | 'translation'

export function buildOriginalBubblePlaybackKey(utteranceId: string, language: string): string {
  return `original:${utteranceId}:${language.trim().toLowerCase()}`
}

export function buildTranslationBubblePlaybackKey(utteranceId: string, language: string): string {
  return `translation:${utteranceId}:${language.trim().toLowerCase()}`
}

// `<kind>:<utteranceId>:<language>`; the id itself never contains the language.
export function parseBubblePlaybackKeyUtteranceId(playbackKey: string): string | null {
  const firstSeparator = playbackKey.indexOf(':')
  const lastSeparator = playbackKey.lastIndexOf(':')
  if (firstSeparator <= 0 || lastSeparator <= firstSeparator + 1) return null
  const kind = playbackKey.slice(0, firstSeparator)
  if (kind !== 'original' && kind !== 'translation') return null
  return playbackKey.slice(firstSeparator + 1, lastSeparator)
}

// 'pending' = requested, queued or synthesizing: a static "…".
// 'playing' = audio is actually coming out: animated bars.
// 'speaking' = the pre-split single key (legacy UI): the original animation.
export type BubbleTtsIndicatorState = 'pending' | 'playing' | 'speaking'

export function resolveBubbleTtsIndicatorState(
  playbackKey: string,
  input: {
    speakingPlaybackKey?: string
    pendingPlaybackKeys?: readonly string[]
    playingPlaybackKey?: string
  },
): BubbleTtsIndicatorState | null {
  if (input.playingPlaybackKey && input.playingPlaybackKey === playbackKey) return 'playing'
  if (input.pendingPlaybackKeys?.includes(playbackKey)) return 'pending'
  if (input.speakingPlaybackKey && input.speakingPlaybackKey === playbackKey) return 'speaking'
  return null
}

export function arePlaybackKeyListsEqual(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === right) return true
  const leftLength = left?.length ?? 0
  const rightLength = right?.length ?? 0
  if (leftLength !== rightLength) return false
  for (let index = 0; index < leftLength; index += 1) {
    if (left![index] !== right![index]) return false
  }
  return true
}

export type BubbleTtsIndicatorKeys = {
  playingPlaybackKey?: string
  pendingPlaybackKeys: string[]
}

// Collapses the room's TTS activity into the two things a bubble can show.
// The current clip is 'playing' only once its audio really started; before
// that it is pending like a manual request still synthesizing or an auto item
// still waiting its turn.
export function resolveBubbleTtsIndicatorKeys(input: {
  current: { playbackKey: string, started: boolean } | null
  pendingManualPlaybackKey?: string | null
  queuedAutoPlaybackKeys?: readonly string[]
}): BubbleTtsIndicatorKeys {
  const playingPlaybackKey = input.current?.started ? input.current.playbackKey : undefined
  const pending: string[] = []
  const pushPending = (key: string | null | undefined) => {
    if (!key || key === playingPlaybackKey || pending.includes(key)) return
    pending.push(key)
  }
  if (input.current && !input.current.started) pushPending(input.current.playbackKey)
  pushPending(input.pendingManualPlaybackKey)
  for (const key of input.queuedAutoPlaybackKeys ?? []) pushPending(key)

  return playingPlaybackKey
    ? { playingPlaybackKey, pendingPlaybackKeys: pending }
    : { pendingPlaybackKeys: pending }
}

export type BubbleTtsRowIndicator = {
  playingPlaybackKey?: string
  pendingPlaybackKeys?: string[]
}

// Per-row props so a row whose bubble is not involved keeps `undefined` and
// its memo stays equal while another row's state changes.
export function groupBubbleTtsIndicatorsByUtterance(
  keys: BubbleTtsIndicatorKeys,
): Map<string, BubbleTtsRowIndicator> {
  const byUtterance = new Map<string, BubbleTtsRowIndicator>()
  const entryFor = (playbackKey: string): BubbleTtsRowIndicator | null => {
    const utteranceId = parseBubblePlaybackKeyUtteranceId(playbackKey)
    if (!utteranceId) return null
    let entry = byUtterance.get(utteranceId)
    if (!entry) {
      entry = {}
      byUtterance.set(utteranceId, entry)
    }
    return entry
  }

  if (keys.playingPlaybackKey) {
    const entry = entryFor(keys.playingPlaybackKey)
    if (entry) entry.playingPlaybackKey = keys.playingPlaybackKey
  }
  for (const playbackKey of keys.pendingPlaybackKeys) {
    const entry = entryFor(playbackKey)
    if (!entry) continue
    entry.pendingPlaybackKeys = [...(entry.pendingPlaybackKeys ?? []), playbackKey]
  }
  return byUtterance
}
