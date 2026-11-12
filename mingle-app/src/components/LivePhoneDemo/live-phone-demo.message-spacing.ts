export interface MessageSpacingSpeaker {
  speaker?: string
  speakerAvatarSeed?: string
  speakerAvatarIndex?: number
  speakerUserId?: string | null
  createdAtMs?: number
}

export type LivePhoneDemoMessageSpacing = 'first' | 'same-speaker' | 'different-speaker'

function resolveSpeakerKey(speaker: MessageSpacingSpeaker): string | null {
  const speakerUserId = speaker.speakerUserId?.trim()
  if (speakerUserId) return `user:${speakerUserId}`

  const speakerLabel = speaker.speaker?.trim().toLowerCase()
  if (speakerLabel && speakerLabel !== 'unknown') return `label:${speakerLabel}`

  const speakerAvatarSeed = speaker.speakerAvatarSeed?.trim()
  if (speakerAvatarSeed) return `avatar:${speakerAvatarSeed}`

  if (typeof speaker.speakerAvatarIndex === 'number' && Number.isFinite(speaker.speakerAvatarIndex)) {
    return `avatar-index:${speaker.speakerAvatarIndex}`
  }

  return null
}

export function resolveLivePhoneDemoMessageSpacing(
  previous: MessageSpacingSpeaker | null | undefined,
  current: MessageSpacingSpeaker,
): LivePhoneDemoMessageSpacing {
  if (!previous) return 'first'

  const previousKey = resolveSpeakerKey(previous)
  const currentKey = resolveSpeakerKey(current)

  return previousKey && currentKey && previousKey === currentKey
    ? 'same-speaker'
    : 'different-speaker'
}

export function resolveLivePhoneDemoMessageSpacingClass(
  previous: MessageSpacingSpeaker | null | undefined,
  current: MessageSpacingSpeaker,
): string {
  const spacing = resolveLivePhoneDemoMessageSpacing(previous, current)
  if (spacing === 'first') return ''
  return spacing === 'same-speaker' ? 'mt-1' : 'mt-1.5'
}

/** A pause longer than this starts a new run even from the same speaker. */
export const MESSAGE_GROUP_MAX_GAP_MS = 5 * 60 * 1000

/**
 * True when `current` continues the same speaker's run started by `previous`
 * (the message right above it), so its bubble can skip the name and photo.
 */
export function isLivePhoneDemoMessageGroupContinuation(
  previous: MessageSpacingSpeaker | null | undefined,
  current: MessageSpacingSpeaker,
): boolean {
  if (resolveLivePhoneDemoMessageSpacing(previous, current) !== 'same-speaker') return false
  const previousAt = previous?.createdAtMs
  const currentAt = current.createdAtMs
  if (typeof previousAt === 'number' && Number.isFinite(previousAt)
    && typeof currentAt === 'number' && Number.isFinite(currentAt)
    && Math.abs(currentAt - previousAt) > MESSAGE_GROUP_MAX_GAP_MS) {
    return false
  }
  return true
}
