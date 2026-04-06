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
const LONG_PRESS_CANCEL_DISTANCE_PX = 10

interface CopyableBubbleSurfaceProps extends ComponentPropsWithoutRef<'div'> {
  text: string
  allText?: string
  copyBubbleLabel: string
  copyAllBubblesLabel?: string
}

export function didLongPressQualify(
  startedAtMs: number | null,
  endedAtMs: number,
): boolean {
  return startedAtMs !== null && (endedAtMs - startedAtMs) >= LONG_PRESS_COPY_DELAY_MS
}

export default function CopyableBubbleSurface({
  text,
  allText,
  copyBubbleLabel,
  copyAllBubblesLabel,
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
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchOriginRef = useRef<{ x: number, y: number } | null>(null)
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false)

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    touchOriginRef.current = null
  }, [])

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer])

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

  const handleCopy = useCallback((targetText: string) => {
    setIsCopyMenuOpen(false)
    void copyTextWithFeedback(targetText)
  }, [])

  const getPrimaryTouchPoint = useCallback((event: TouchEvent<HTMLDivElement>) => {
    return event.touches[0] ?? event.changedTouches[0] ?? null
  }, [])

  const showAllCopyButton = Boolean(allText && copyAllBubblesLabel)

  return (
    <div
      ref={surfaceRef}
      {...props}
      data-copyable-bubble
      onContextMenu={(event) => {
        onContextMenu?.(event)
        if (event.defaultPrevented) return

        event.preventDefault()
        setIsCopyMenuOpen(true)
      }}
      onDoubleClick={(event) => {
        onDoubleClick?.(event)
        if (event.defaultPrevented) return
        handleCopy(text)
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event)
        if (event.defaultPrevented) return
        const touchPoint = getPrimaryTouchPoint(event)
        if (!touchPoint) return

        clearLongPressTimer()
        setIsCopyMenuOpen(false)
        touchOriginRef.current = { x: touchPoint.clientX, y: touchPoint.clientY }
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null
          touchOriginRef.current = null
          setIsCopyMenuOpen(true)
        }, LONG_PRESS_COPY_DELAY_MS)
      }}
      onTouchMove={(event) => {
        onTouchMove?.(event)
        if (event.defaultPrevented) return
        if (longPressTimerRef.current === null || touchOriginRef.current === null) return
        const touchPoint = getPrimaryTouchPoint(event)
        if (!touchPoint) {
          clearLongPressTimer()
          return
        }

        const movedX = Math.abs(touchPoint.clientX - touchOriginRef.current.x)
        const movedY = Math.abs(touchPoint.clientY - touchOriginRef.current.y)
        if (movedX > LONG_PRESS_CANCEL_DISTANCE_PX || movedY > LONG_PRESS_CANCEL_DISTANCE_PX) {
          clearLongPressTimer()
        }
      }}
      onTouchEnd={(event) => {
        onTouchEnd?.(event)
        clearLongPressTimer()
      }}
      onTouchCancel={(event) => {
        onTouchCancel?.(event)
        clearLongPressTimer()
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
          <div className="w-36 rounded-xl bg-white shadow-[0_8px_28px_rgba(15,23,42,0.16),0_2px_8px_rgba(15,23,42,0.08)]">
            <button
              type="button"
              data-copyable-bubble-menu-button
              aria-label={copyBubbleLabel}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleCopy(text)
              }}
              className={`flex w-full items-center justify-between px-3.5 py-3 text-[14px] font-medium text-slate-800 transition hover:bg-slate-50 active:bg-slate-100 ${showAllCopyButton ? 'rounded-t-xl' : 'rounded-xl'}`}
            >
              <span>{copyBubbleLabel}</span>
              <Copy className="h-4 w-4 shrink-0 text-slate-500" />
            </button>
            {showAllCopyButton && (
              <>
                <div className="mx-3 h-[1px] bg-slate-100" />
                <button
                  type="button"
                  aria-label={copyAllBubblesLabel}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    handleCopy(allText!)
                  }}
                  className="flex w-full items-center justify-between rounded-b-xl px-3.5 py-3 text-[14px] font-medium text-slate-800 transition hover:bg-slate-50 active:bg-slate-100"
                >
                  <span>{copyAllBubblesLabel}</span>
                  <Copy className="h-4 w-4 shrink-0 text-slate-500" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
