// A line said in a voice talk, written down by the server's interpreter for
// the people who had interpretation on. It is an ordinary room message whose metadata lists who
// may read it (set by the server, never by the sender's phone): the people
// with interpretation on at that moment, the speaker too only when they have
// it on themselves. Everyone
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

/**
 * The tag for a line `speakerUserId` said: only the people with
 * interpretation on. The speaker reads their own line only when they have it
 * on themselves (`viewers` then has them already).
 */
export function buildVoiceCaptionTag(input: { callId: string, speakerUserId: string, viewers: readonly string[] }): VoiceCaptionTag {
  return { callId: input.callId, viewers: [...new Set(input.viewers)] }
}

/** The room message of the interpreter's line `lineId`, and of its live bubble before it is saved. */
export function buildVoiceCaptionClientMessageId(lineId: string): string {
  return `voice-caption-${lineId}`.slice(0, 190)
}
