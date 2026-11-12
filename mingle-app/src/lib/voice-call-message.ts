// The room message a voice talk leaves when it starts: "<name> started a
// voice talk", with a Join button. It is an ordinary room message (so the room
// list, unread counts and history carry it) whose metadata names the call.

export type VoiceCallMessage = {
  /** The call this message announces. The button joins it while it is live. */
  callId: string
}

/** Stored as the message's source text; shown where only text fits (room list preview). */
export const VOICE_CALL_MESSAGE_TEXT = '📞 Voice talk'

/** One announcement per call: a retried start writes the same message. */
export function buildVoiceCallMessageClientId(callId: string): string {
  return `voice-call-${callId}`
}

export function normalizeVoiceCallMessage(value: unknown): VoiceCallMessage | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const callId = (value as { callId?: unknown }).callId
  return typeof callId === 'string' && callId.trim() ? { callId: callId.trim() } : null
}

/** What the Join button of an announcement does, given the room's call right now. */
export type VoiceCallMessageState = 'joinable' | 'joined' | 'ended'

export function resolveVoiceCallMessageState(input: {
  message: VoiceCallMessage
  /** The room's live call, or null when none is live. */
  liveCallId: string | null
  /** This phone is in the live call. */
  joined: boolean
}): VoiceCallMessageState {
  if (!input.liveCallId || input.liveCallId !== input.message.callId) return 'ended'
  return input.joined ? 'joined' : 'joinable'
}
