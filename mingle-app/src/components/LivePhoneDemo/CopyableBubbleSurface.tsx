'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type TouchEvent,
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

export function didLongPressQualify(
  startedAtMs: number | null,
  endedAtMs: number,
): boolean {
  return startedAtMs !== null && (endedAtMs - startedAtMs) >= LONG_PRESS_COPY_DELAY_MS
}

export default function CopyableBubbleSurface({
  text,
  copiedToastLabel,
  className,
  style,
  onContextMenu,
  onDoubleClick,
  onTouchCancel,
  onTouchEnd,
  onTouchMove,
  onTouchStart,
  ...props
}: CopyableBubbleSurfaceProps) {
  const touchStartedAtRef = useRef<number | null>(null)
  const touchOriginRef = useRef<{ x: number, y: number } | null>(null)

  const clearPendingLongPress = useCallback(() => {
    touchStartedAtRef.current = null
    touchOriginRef.current = null
  }, [])

  useEffect(() => clearPendingLongPress, [clearPendingLongPress])

  const handleCopy = useCallback(() => {
    void copyTextWithFeedback(text, copiedToastLabel)
  }, [copiedToastLabel, text])

  const getPrimaryTouchPoint = useCallback((event: TouchEvent<HTMLDivElement>) => {
    return event.touches[0] ?? event.changedTouches[0] ?? null
  }, [])

  return (
    <div
      {...props}
      data-copyable-bubble
      onContextMenu={(event) => {
        onContextMenu?.(event)
        if (event.defaultPrevented) return

        event.preventDefault()
      }}
      onDoubleClick={(event) => {
        onDoubleClick?.(event)
        if (event.defaultPrevented) return
        handleCopy()
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event)
        if (event.defaultPrevented) return
        const touchPoint = getPrimaryTouchPoint(event)
        if (!touchPoint) return

        touchStartedAtRef.current = Date.now()
        touchOriginRef.current = { x: touchPoint.clientX, y: touchPoint.clientY }
      }}
      onTouchMove={(event) => {
        onTouchMove?.(event)
        if (event.defaultPrevented) return
        if (touchStartedAtRef.current === null || touchOriginRef.current === null) return
        const touchPoint = getPrimaryTouchPoint(event)
        if (!touchPoint) {
          clearPendingLongPress()
          return
        }

        const movedX = Math.abs(touchPoint.clientX - touchOriginRef.current.x)
        const movedY = Math.abs(touchPoint.clientY - touchOriginRef.current.y)
        if (movedX > LONG_PRESS_CANCEL_DISTANCE_PX || movedY > LONG_PRESS_CANCEL_DISTANCE_PX) {
          clearPendingLongPress()
        }
      }}
      onTouchEnd={(event) => {
        onTouchEnd?.(event)
        if (event.defaultPrevented) return

        const startedAtMs = touchStartedAtRef.current
        clearPendingLongPress()
        if (!didLongPressQualify(startedAtMs, Date.now())) return

        event.preventDefault()
        handleCopy()
      }}
      onTouchCancel={(event) => {
        onTouchCancel?.(event)
        clearPendingLongPress()
      }}
      className={cn('select-none touch-manipulation', className)}
      draggable={false}
      style={{
        ...style,
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    />
  )
}
