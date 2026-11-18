'use client'

import { createContext, useContext } from 'react'

// What a Hash Rush announcement in the room needs: which game runs, whether
// this phone is in it, and how to join. Provided by the room; a bubble outside
// a room (previews, tests) gets null and shows no button.
export type HashRushRoomState = {
  /** The room's running game, or null when none runs. */
  liveSessionId: string | null
  /** This phone is in the game. */
  joined: boolean
  /** Joins the running game. */
  join: () => void
  /** The game is up on screen (false while it is lowered to the chat). */
  open?: boolean
  /** Brings a lowered game back up. */
  reopen?: () => void
  /** Leaves the game (from the card, while it is lowered). */
  quit?: () => void
}

export const HashRushRoomContext = createContext<HashRushRoomState | null>(null)

export function useHashRushRoom(): HashRushRoomState | null {
  return useContext(HashRushRoomContext)
}
