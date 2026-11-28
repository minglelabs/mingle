// The stage of an open room's voice talk, as the panel reads it from the
// server's call (see server/voice/voice-stage.ts): who speaks, who listens,
// who raised a hand, and what this viewer may do. A chat room's call has no
// stage: everyone in it speaks.

export type VoiceStageRole = 'speaker' | 'listener'

type StageCall = {
  participants: ReadonlyArray<{ userId: string; name: string | null; image: string | null; role?: string; handRaised?: boolean }>
  stage?: { hostUserId: string } | null
} | null

export type VoiceStageListener = { userId: string; name: string | null; image: string | null; handRaised: boolean }

export type VoiceStageView = {
  /** The room's call has a stage. */
  enabled: boolean
  isHost: boolean
  /** This viewer's role in the call, or null when they are not in it. */
  myRole: VoiceStageRole | null
  /** Did this viewer raise a hand. */
  myHandRaised: boolean
  /** The people who only listen, raised hands first. */
  listeners: VoiceStageListener[]
  listenerIds: ReadonlySet<string>
}

const NONE: VoiceStageView = { enabled: false, isHost: false, myRole: null, myHandRaised: false, listeners: [], listenerIds: new Set() }

export function resolveVoiceStage(call: StageCall, viewerUserId: string | null | undefined): VoiceStageView {
  if (!call?.stage) return NONE
  const listeners = call.participants
    .filter((participant) => participant.role === 'listener')
    .map((participant) => ({ userId: participant.userId, name: participant.name, image: participant.image, handRaised: participant.handRaised === true }))
    .sort((left, right) => Number(right.handRaised) - Number(left.handRaised))
  const me = viewerUserId ? call.participants.find((participant) => participant.userId === viewerUserId) : undefined
  return {
    enabled: true,
    isHost: !!viewerUserId && call.stage.hostUserId === viewerUserId,
    myRole: me ? (me.role === 'listener' ? 'listener' : 'speaker') : null,
    myHandRaised: me?.role === 'listener' && me.handRaised === true,
    listeners,
    listenerIds: new Set(listeners.map((listener) => listener.userId)),
  }
}

/**
 * What changed for this viewer between two reads of the call: put on the
 * stage (the app reconnects to get the right to send its voice) or taken off
 * it (its mic goes off). Joining and leaving the call are neither.
 */
export function voiceStageTransition(previous: VoiceStageRole | null, next: VoiceStageRole | null): 'promoted' | 'demoted' | null {
  if (previous === 'listener' && next === 'speaker') return 'promoted'
  if (previous === 'speaker' && next === 'listener') return 'demoted'
  return null
}
