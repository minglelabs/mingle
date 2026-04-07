'use client'

import { Copy, Volume2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type TouchEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { copyTextWithFeedback } from './live-phone-demo.copy'

const LONG_PRESS_COPY_DELAY_MS = 450
const LONG_PRESS_CANCEL_DISTANCE_PX = 10
const DOUBLE_TAP_MAX_DELAY_MS = 300
const DOUBLE_TAP_MAX_DISTANCE_PX = 30
const TOOLTIP_GAP_PX = 8
// 버블 top이 이 값(px) 미만이면 툴팁을 버블 아래에 표시
const TOOLTIP_ESTIMATED_MAX_HEIGHT_PX = 320

interface CopyableBubbleSurfaceProps extends ComponentPropsWithoutRef<'div'> {
  text: string
  allText?: string
  copyBubbleLabel: string
  copyAllBubblesLabel?: string
  playPronunciationLabel?: string
  onPlayPronunciation?: () => void
}

export function didLongPressQualify(
  startedAtMs: number | null,
  endedAtMs: number,
): boolean {
  return startedAtMs !== null && (endedAtMs - startedAtMs) >= LONG_PRESS_COPY_DELAY_MS
}

type TooltipPos =
  | { side: 'above'; bottom: number; left: number }
  | { side: 'below'; top: number; left: number }

export default function CopyableBubbleSurface({
  text,
  allText,
  copyBubbleLabel,
  copyAllBubblesLabel,
  playPronunciationLabel,
  onPlayPronunciation,
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
  const menuRef = useRef<HTMLDivElement | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchOriginRef = useRef<{ x: number, y: number } | null>(null)
  const lastTapRef = useRef<{ time: number, x: number, y: number } | null>(null)
  // 터치 더블탭 이후 dblclick 이벤트가 중복 발동하는 것을 방지
  const touchDoubleTapFiredRef = useRef(false)
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null)

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    touchOriginRef.current = null
  }, [])

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer])

  const calcTooltipPos = useCallback((): TooltipPos | null => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return null
    const left = rect.left + rect.width / 2
    // 위쪽 공간이 충분하면 버블 위에, 부족하면 버블 아래에 표시
    if (rect.top - TOOLTIP_GAP_PX >= TOOLTIP_ESTIMATED_MAX_HEIGHT_PX) {
      return {
        side: 'above',
        bottom: window.innerHeight - rect.top + TOOLTIP_GAP_PX,
        left,
      }
    }
    return {
      side: 'below',
      top: rect.bottom + TOOLTIP_GAP_PX,
      left,
    }
  }, [])

  const openMenu = useCallback(() => {
    const pos = calcTooltipPos()
    setTooltipPos(pos)
    setIsCopyMenuOpen(true)
  }, [calcTooltipPos])

  const closeMenu = useCallback(() => {
    setIsCopyMenuOpen(false)
    setTooltipPos(null)
  }, [])

  // 외부 클릭/스크롤/리사이즈로 메뉴 닫기
  // 핵심: portal로 렌더된 menuRef도 "내부"로 간주해야 듣기 버튼 작동
  useEffect(() => {
    if (!isCopyMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) { closeMenu(); return }
      const insideSurface = surfaceRef.current?.contains(target) ?? false
      const insideMenu = menuRef.current?.contains(target) ?? false
      if (!insideSurface && !insideMenu) {
        closeMenu()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('resize', closeMenu)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu)
    }
  }, [isCopyMenuOpen, closeMenu])

  const handleCopy = useCallback((targetText: string) => {
    closeMenu()
    void copyTextWithFeedback(targetText)
  }, [closeMenu])

  const handlePlayPronunciation = useCallback(() => {
    closeMenu()
    onPlayPronunciation?.()
  }, [onPlayPronunciation, closeMenu])

  const getPrimaryTouchPoint = useCallback((event: TouchEvent<HTMLDivElement>) => {
    return event.touches[0] ?? event.changedTouches[0] ?? null
  }, [])

  const showAllCopyButton = Boolean(allText && copyAllBubblesLabel)
  const showPlayPronunciationButton = Boolean(playPronunciationLabel && onPlayPronunciation)

  const tooltipFixedStyle: React.CSSProperties = tooltipPos
    ? tooltipPos.side === 'above'
      ? { position: 'fixed', bottom: tooltipPos.bottom, left: tooltipPos.left, transform: 'translateX(-50%)', zIndex: 9999 }
      : { position: 'fixed', top: tooltipPos.top, left: tooltipPos.left, transform: 'translateX(-50%)', zIndex: 9999 }
    : {}

  const tooltipNode = isCopyMenuOpen && tooltipPos && typeof document !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      data-copyable-bubble-menu
      style={tooltipFixedStyle}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchCancel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="w-44 rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_8px_32px_rgba(15,23,42,0.13),0_2px_10px_rgba(15,23,42,0.07)]">
        <button
          type="button"
          data-copyable-bubble-menu-button
          aria-label={copyBubbleLabel}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            handleCopy(text)
          }}
          className={`flex w-full items-center justify-between px-4 py-3 text-[14px] font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 ${(showAllCopyButton || showPlayPronunciationButton) ? 'rounded-t-2xl' : 'rounded-2xl'}`}
        >
          <span>{copyBubbleLabel}</span>
          <Copy className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
        {showAllCopyButton && (
          <>
            <div className="h-px bg-gray-100" />
            <button
              type="button"
              aria-label={copyAllBubblesLabel}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleCopy(allText!)
              }}
              className={`flex w-full items-center justify-between px-4 py-3 text-[14px] font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 ${showPlayPronunciationButton ? '' : 'rounded-b-2xl'}`}
            >
              <span>{copyAllBubblesLabel}</span>
              <Copy className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </>
        )}
        {showPlayPronunciationButton && (
          <>
            <div className="h-px bg-gray-100" />
            <button
              type="button"
              aria-label={playPronunciationLabel}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handlePlayPronunciation()
              }}
              className="flex w-full items-center justify-between rounded-b-2xl px-4 py-3 text-[14px] font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100"
            >
              <span>{playPronunciationLabel}</span>
              <Volume2 className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div
      ref={surfaceRef}
      {...props}
      data-copyable-bubble
      data-copyable-bubble-double-tap-action={showPlayPronunciationButton ? 'play-pronunciation' : 'copy'}
      onContextMenu={(event) => {
        onContextMenu?.(event)
        if (event.defaultPrevented) return
        event.preventDefault()
        openMenu()
      }}
      onDoubleClick={(event) => {
        onDoubleClick?.(event)
        if (event.defaultPrevented) return
        // 터치 더블탭으로 이미 처리된 경우 dblclick 중복 발동 방지
        if (touchDoubleTapFiredRef.current) {
          touchDoubleTapFiredRef.current = false
          return
        }
        if (showPlayPronunciationButton) {
          handlePlayPronunciation()
          return
        }
        handleCopy(text)
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event)
        if (event.defaultPrevented) return
        const touchPoint = getPrimaryTouchPoint(event)
        if (!touchPoint) return

        // 터치 기반 더블탭 감지 (모바일 웹뷰에서 dblclick 미발생 대응)
        const now = Date.now()
        const last = lastTapRef.current
        if (last !== null) {
          const timeDiff = now - last.time
          const distX = Math.abs(touchPoint.clientX - last.x)
          const distY = Math.abs(touchPoint.clientY - last.y)
          if (
            timeDiff <= DOUBLE_TAP_MAX_DELAY_MS &&
            distX <= DOUBLE_TAP_MAX_DISTANCE_PX &&
            distY <= DOUBLE_TAP_MAX_DISTANCE_PX
          ) {
            clearLongPressTimer()
            lastTapRef.current = null
            // 이후 발생할 dblclick 이벤트가 중복 처리되지 않도록 플래그 세팅
            touchDoubleTapFiredRef.current = true
            // 브라우저 dblclick 이벤트 억제 시도
            event.preventDefault()
            if (showPlayPronunciationButton) {
              handlePlayPronunciation()
            } else {
              handleCopy(text)
            }
            return
          }
        }
        lastTapRef.current = { time: now, x: touchPoint.clientX, y: touchPoint.clientY }

        clearLongPressTimer()
        closeMenu()
        touchOriginRef.current = { x: touchPoint.clientX, y: touchPoint.clientY }
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null
          touchOriginRef.current = null
          openMenu()
        }, LONG_PRESS_COPY_DELAY_MS)
      }}
      onTouchMove={(event) => {
        onTouchMove?.(event)
        if (event.defaultPrevented) return
        if (longPressTimerRef.current === null || touchOriginRef.current === null) return
        const touchPoint = getPrimaryTouchPoint(event)
        if (!touchPoint) { clearLongPressTimer(); return }

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
        lastTapRef.current = null
        touchDoubleTapFiredRef.current = false
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
      {tooltipNode}
    </div>
  )
}
