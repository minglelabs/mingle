// A line said in a voice talk and written down for the people who had
// interpretation on. It is an ordinary room message whose metadata lists who
// may read it (set by the server, never by the sender's phone): the people
// with interpretation on at that moment, and the one who said it. Everyone
// else in the room never receives it, and it does not count as the room's
// latest message, as unread, or as a push.

export type VoiceCaptionTag = {
  callId: string
  /** User ids that may read this line. */
  viewers: string[]
}

export function normalizeVoiceCaptionTag(value: unknown): VoiceCaptionTag | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as { callId?: unknown, viewers?: unknown }
  if (typeof record.callId !== 'string' || !record.callId.trim()) return null
  const viewers = Array.isArray(record.viewers)
    ? [...new Set(record.viewers.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
    : []
  return { callId: record.callId.trim(), viewers }
}

/** The tag of a stored message (`metadata.voiceCaption`), or null for an ordinary message. */
export function readVoiceCaptionTag(metadata: unknown): VoiceCaptionTag | null {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return null
  return normalizeVoiceCaptionTag((metadata as { voiceCaption?: unknown }).voiceCaption)
}

/** Whether `viewerUserId` may read a message with this metadata. Ordinary messages: everyone. */
export function canViewMessageWithMetadata(metadata: unknown, viewerUserId: string | null | undefined): boolean {
  const tag = readVoiceCaptionTag(metadata)
  if (!tag) return true
  return !!viewerUserId && tag.viewers.includes(viewerUserId)
}

/** The tag for a line `speakerUserId` said: the readers, and the speaker. */
export function buildVoiceCaptionTag(input: { callId: string, speakerUserId: string, viewers: readonly string[] }): VoiceCaptionTag {
  return { callId: input.callId, viewers: [...new Set([...input.viewers, input.speakerUserId])] }
}

/**
 * Whether this phone writes down its own speech for the call: it is in the
 * call with its mic on, and someone else has interpretation on.
 */
export function shouldTranscribeForVoiceTalk(input: {
  connected: boolean
  micOn: boolean
  selfUserId: string | null
  /** User ids with interpretation on, this phone's own included when on. */
  viewers: readonly string[]
}): boolean {
  if (!input.connected || !input.micOn) return false
  return input.viewers.some((id) => id !== input.selfUserId)
}

/** Who pays for this phone's speech-to-text in the call (same rule as the server's). */
export function resolveVoiceCaptionPayer(input: { selfUserId: string | null, viewers: readonly string[] }): string | null {
  const others = input.viewers.filter((id) => id !== input.selfUserId)
  if (others.length === 0) return null
  return input.selfUserId && input.viewers.includes(input.selfUserId) ? input.selfUserId : others[0]
}
