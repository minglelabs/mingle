'use client'

// Hash Rush over the chat room: a layer that covers the whole room, all of it
// the game's. There is no app bar: the way back to the chat is the game's own
// pill over the map's top left corner (with a green dot while the room's voice
// talk is connected), under the status bar.
//
// - Back (the pill, Android back) lowers the layer. Lowered, the game
//   keeps running out of sight, silent, and this hamster stands still; opening
//   it again in the same room shows the same round. The room's owner drops the
//   layer when the room is left.
// - While it is up, the room's edge swipe, the iOS swipe-back and the WebView's
//   back/forward gestures never take a swipe on the game, and the ad banner and
//   the app's toasts stay hidden (docs/hash-rush-in-app-uiux.md A2-A4).

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { registerNativeEdgeSwipeSuppression } from '@/components/slide-surface'
import { registerNativeBackHandler } from '@/lib/native-back-handler'
import { useNativeBannerSuppression } from '@/lib/use-native-banner-suppression'
import HashRushGame from './HashRushGame'
import { hashRushGameCopy } from './copy'

// Android back lowers the game before the room's own layers (composer and
// menus at 10, the room at 4-5) and after screens opened over the room (20+).
const NATIVE_BACK_PRIORITY = 15

// App toasts are portaled above every app layer; the global stylesheet hides
// them while this flag is on (html[data-hash-rush-open="true"]), so nothing
// floats over the game.
let toastHoldCount = 0
function holdToastsHidden(): () => void {
  toastHoldCount += 1
  document.documentElement.dataset.hashRushOpen = 'true'
  let released = false
  return () => {
    if (released) return
    released = true
    toastHoldCount = Math.max(0, toastHoldCount - 1)
    if (toastHoldCount === 0) delete document.documentElement.dataset.hashRushOpen
  }
}

type Props = {
  /** Up over the room. Lowered, the game keeps running out of sight. */
  open: boolean
  conversationId: string
  /** Who is playing; entry tickets are kept per viewer and room. */
  viewerKey: string
  playerName: string
  uiLocale: string
  /** This room's voice talk is connected. */
  voiceActive: boolean
  onClose: () => void
}

export default function HashRushRoomLayer({ open, conversationId, viewerKey, playerName, uiLocale, voiceActive, onClose }: Props) {
  const copy = hashRushGameCopy(uiLocale)

  useNativeBannerSuppression(open)

  useEffect(() => {
    if (!open) return
    return registerNativeEdgeSwipeSuppression()
  }, [open])

  useEffect(() => {
    if (!open) return
    return registerNativeBackHandler(() => {
      onClose()
      return true
    }, NATIVE_BACK_PRIORITY)
  }, [onClose, open])

  useEffect(() => {
    if (!open) return
    return holdToastsHidden()
  }, [open])

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={open ? { y: 0, visibility: 'visible' } : { y: '100%', transitionEnd: { visibility: 'hidden' } }}
      transition={{ type: 'spring', stiffness: 360, damping: 38 }}
      // Touches on the game are the game's: the room's left-edge swipe (an
      // ancestor) must not start from here.
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      // Over the whole room: its top bar (40), talk and composer; under the
      // room's menus and dialogs (50+) and screens opened over the room.
      className={`absolute inset-0 z-[47] overflow-hidden bg-[#24572f] ${open ? '' : 'pointer-events-none'}`}
      role="dialog"
      aria-modal={open}
      aria-label={copy.title}
      aria-hidden={!open}
      inert={!open}
      data-qa="hash-rush-game-layer"
    >
      <HashRushGame
        conversationId={conversationId}
        viewerKey={viewerKey}
        playerName={playerName}
        uiLocale={uiLocale}
        visible={open}
        voiceActive={voiceActive}
        onBack={onClose}
      />
    </motion.div>
  )
}
