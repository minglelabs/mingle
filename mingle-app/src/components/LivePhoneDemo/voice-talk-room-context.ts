'use client'

import { createContext, useContext } from 'react'

// The room's voice talk as a message bubble needs it: which call is live,
// whether this phone is in it, and how to join. Provided by the room; a
// bubble outside a room (previews, tests) gets null and shows no button.
export type VoiceTalkRoomState = {
  /** The room's live call, or null when none is live. */
  liveCallId: string | null
  /** This phone is in the live call. */
  joined: boolean
  /** Joins the live call. */
  join: () => void
}

export const VoiceTalkRoomContext = createContext<VoiceTalkRoomState | null>(null)

export function useVoiceTalkRoom(): VoiceTalkRoomState | null {
  return useContext(VoiceTalkRoomContext)
}
