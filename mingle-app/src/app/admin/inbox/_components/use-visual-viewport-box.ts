'use client'

import { useEffect, useState } from 'react'

export type VisualViewportBox = {
  /** Offset of the visible area from the layout viewport's top (iOS scrolls it when the keyboard opens). */
  top: number
  height: number
  /** The on-screen keyboard (or anything else) covers more than 120 px at the bottom. */
  keyboardOpen: boolean
}

const KEYBOARD_THRESHOLD_PX = 120

/**
 * The visible part of the page, from `window.visualViewport`, so a full-screen
 * chat can sit exactly above the on-screen keyboard on iOS Safari (where a
 * fixed element otherwise slides under the keyboard). Null until measured
 * or when the browser has no visualViewport: callers then fill the window.
 */
export function useVisualViewportBox(): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(null)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    let frame = 0
    const sync = () => {
      frame = 0
      const height = Math.round(viewport.height)
      const top = Math.max(0, Math.round(viewport.offsetTop))
      const covered = window.innerHeight - viewport.height - viewport.offsetTop
      setBox((current) => (
        current && current.top === top && current.height === height && current.keyboardOpen === (covered > KEYBOARD_THRESHOLD_PX)
          ? current
          : { top, height, keyboardOpen: covered > KEYBOARD_THRESHOLD_PX }
      ))
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(sync)
    }
    schedule()
    viewport.addEventListener('resize', schedule)
    viewport.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', schedule)
      viewport.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return box
}
