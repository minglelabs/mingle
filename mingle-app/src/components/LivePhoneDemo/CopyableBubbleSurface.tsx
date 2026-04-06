'use client'

import { Copy } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useState,
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
  copyBubbleLabel: string
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
  copyBubbleLabel,
  copiedToastLabel,
  children,
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
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const touchStartedAtRef = useRef<number | null>(null)
  const touchOriginRef = useRef<{ x: number, y: number } | null>(null)
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false)

  const clearPendingLongPress = useCallback(() => {
    touchStartedAtRef.current = null
    touchOriginRef.current = null
  }, [])

  useEffect(() => clearPendingLongPress, [clearPendingLongPress])

  useEffect(() => {
    if (!isCopyMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        setIsCopyMenuOpen(false)
        return
      }
      if (!surfaceRef.current?.contains(target)) {
        setIsCopyMenuOpen(false)
      }
    }

    const dismissMenu = () => {
      setIsCopyMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('scroll', dismissMenu, true)
    window.addEventListener('resize', dismissMenu)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('scroll', dismissMenu, true)
      window.removeEventListener('resize', dismissMenu)
    }
  }, [isCopyMenuOpen])

  const handleCopy = useCallback(() => {
    setIsCopyMenuOpen(false)
    void copyTextWithFeedback(text, copiedToastLabel)
  }, [copiedToastLabel, text])

  const getPrimaryTouchPoint = useCallback((event: TouchEvent<HTMLDivElement>) => {
    return event.touches[0] ?? event.changedTouches[0] ?? null
  }, [])

  return (
    <div
      ref={surfaceRef}
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

        setIsCopyMenuOpen(false)
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
        setIsCopyMenuOpen(true)
      }}
      onTouchCancel={(event) => {
        onTouchCancel?.(event)
        clearPendingLongPress()
      }}
      className={cn('relative select-none touch-manipulation overflow-visible', className)}
      draggable={false}
      style={{
        ...style,
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {children}
      {isCopyMenuOpen && (
        <div
          data-copyable-bubble-menu
          className="absolute bottom-[calc(100%+0.5rem)] left-1/2 z-30 -translate-x-1/2"
        >
          <div className="rounded-2xl bg-white px-1.5 py-1 shadow-[0_14px_36px_rgba(15,23,42,0.16),0_4px_10px_rgba(15,23,42,0.08)] ring-1 ring-black/5">
            <button
              type="button"
              data-copyable-bubble-menu-button
              aria-label={copyBubbleLabel}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleCopy()
              }}
              className="inline-flex min-w-20 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
            >
              <Copy className="h-3.5 w-3.5 text-slate-500" />
              <span>{copyBubbleLabel}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
