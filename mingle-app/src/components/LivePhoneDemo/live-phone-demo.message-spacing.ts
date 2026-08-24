export interface MessageSpacingSpeaker {
  speaker?: string
  speakerAvatarSeed?: string
  speakerAvatarIndex?: number
  speakerUserId?: string | null
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
  return spacing === 'same-speaker' ? 'mt-0.5' : 'mt-1.5'
}
