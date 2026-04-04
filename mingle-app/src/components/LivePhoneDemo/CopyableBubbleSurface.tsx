'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
} from 'react'
import { cn } from '@/lib/utils'
import { copyTextWithFeedback } from './live-phone-demo.copy'

const LONG_PRESS_COPY_DELAY_MS = 450
const LONG_PRESS_CANCEL_DISTANCE_PX = 8

interface CopyableBubbleSurfaceProps extends ComponentPropsWithoutRef<'div'> {
  text: string
  copiedToastLabel: string
}

export default function CopyableBubbleSurface({
  text,
  copiedToastLabel,
  className,
  onContextMenu,
  onDoubleClick,
  onPointerCancel,
  onPointerDown,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  ...props
}: CopyableBubbleSurfaceProps) {
  const longPressTimerRef = useRef<number | null>(null)
  const pointerOriginRef = useRef<{ x: number, y: number } | null>(null)
  const suppressContextMenuRef = useRef(false)

  const clearPendingLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    pointerOriginRef.current = null
  }, [])

  useEffect(() => clearPendingLongPress, [clearPendingLongPress])

  const handleCopy = useCallback(() => {
    void copyTextWithFeedback(text, copiedToastLabel)
  }, [copiedToastLabel, text])

  return (
    <div
      {...props}
      data-copyable-bubble
      onContextMenu={(event) => {
        onContextMenu?.(event)
        if (event.defaultPrevented) return
        if (suppressContextMenuRef.current) {
          event.preventDefault()
          suppressContextMenuRef.current = false
        }
      }}
      onDoubleClick={(event) => {
        onDoubleClick?.(event)
        if (event.defaultPrevented) return
        handleCopy()
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (event.defaultPrevented) return
        if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return

        clearPendingLongPress()
        suppressContextMenuRef.current = false
        pointerOriginRef.current = { x: event.clientX, y: event.clientY }
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null
          suppressContextMenuRef.current = true
          handleCopy()
        }, LONG_PRESS_COPY_DELAY_MS)
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        if (event.defaultPrevented) return
        if (longPressTimerRef.current === null || pointerOriginRef.current === null) return

        const movedX = Math.abs(event.clientX - pointerOriginRef.current.x)
        const movedY = Math.abs(event.clientY - pointerOriginRef.current.y)
        if (movedX > LONG_PRESS_CANCEL_DISTANCE_PX || movedY > LONG_PRESS_CANCEL_DISTANCE_PX) {
          clearPendingLongPress()
        }
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event)
        clearPendingLongPress()
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event)
        clearPendingLongPress()
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event)
        clearPendingLongPress()
      }}
      className={cn('select-text touch-manipulation', className)}
    />
  )
}
