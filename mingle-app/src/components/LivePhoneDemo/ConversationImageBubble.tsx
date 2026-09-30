'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type TouchEvent as ReactTouchEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { X } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { type ConversationMessageImage } from '@/lib/conversation-image'
import { resolveConversationImageCopy } from '@/i18n/conversation-image-copy'
import CopyableBubbleSurface from './CopyableBubbleSurface'
import MessageMediaDialog from './MessageMediaDialog'
import {
  DIRECTION_SLOP_PX,
  appendVelocitySample,
  backdropOpacityForProgress,
  dragProgress,
  effectiveVelocity,
  isDismissibleDrag,
  offsetForDrag,
  resolveDragAxis,
  scaleForProgress,
  shouldDismissOnRelease,
  windowVelocity,
  type VelocitySample,
} from './swipe-to-dismiss.logic'

/** How long the animate-out transition runs before the fallback timer fires. */
const DISMISS_ANIMATION_MS = 260

/** Fallback for the 200ms spring-back transition: clears `settling` even when
 *  no transition runs (release at offset 0, interrupted transition). */
const SETTLE_FALLBACK_MS = 260

/** With reduced motion there is no animate-out, but the viewer still stays
 *  mounted this long after release so the click iOS WKWebView synthesizes
 *  after touchend lands on the viewer, not on the chat bubble behind it. */
const REDUCED_MOTION_CLOSE_DELAY_MS = 80

const MIN_IMAGE_SCALE = 1
const MAX_IMAGE_SCALE = 4
const INITIAL_IMAGE_TRANSFORM: ImageTransform = { scale: MIN_IMAGE_SCALE, x: 0, y: 0 }

type PointerPoint = { x: number; y: number }
type ImageTransform = { scale: number; x: number; y: number }
type GestureState =
  | { kind: 'pan'; startPoint: PointerPoint; startTransform: ImageTransform }
  | { kind: 'pinch'; startCenter: PointerPoint; startDistance: number; startTransform: ImageTransform }

function distanceBetween(first: PointerPoint, second: PointerPoint) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function centerOfPoints(points: PointerPoint[]): PointerPoint {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Live swipe-down-to-dismiss drag, tracked separately from pan/pinch. Only ever
// engaged for a single pointer at base zoom; the gesture math lives in
// ./swipe-to-dismiss.logic.
type DismissDrag = {
  pointerId: number
  startPoint: PointerPoint
  locked: boolean
  offsetY: number
  /** Recent pointer samples for the windowed release velocity. */
  samples: VelocitySample[]
  lastTime: number
}

function ZoomableConversationImage({ src, alt, width, height, onError, onDismiss, onDragProgress, onSettleChange }: {
  src: string; alt: string; width: number; height: number; onError: () => void
  onDismiss: () => void; onDragProgress: (progress: number) => void; onSettleChange: (settling: boolean) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointersRef = useRef<Map<number, PointerPoint>>(new Map())
  const gestureRef = useRef<GestureState | null>(null)
  const transformRef = useRef<ImageTransform>(INITIAL_IMAGE_TRANSFORM)
  const [transform, setTransform] = useState<ImageTransform>(INITIAL_IMAGE_TRANSFORM)
  // Swipe-down-to-dismiss drag state (base zoom only).
  const dismissRef = useRef<DismissDrag | null>(null)
  const [dismissOffset, setDismissOffset] = useState(0)
  const [animateOut, setAnimateOut] = useState(false)
  // `settling` is true only while a released drag animates (spring-back or
  // animate-out); it is the ONLY time the photo gets a CSS transition, so
  // pinch, pan and double-click zoom keep their original no-transition, 1:1
  // response. A live finger drag also has no transition.
  const [settling, setSettling] = useState(false)
  const closedRef = useRef(false)
  // True once a release committed to dismissing (animate-out or the deferred
  // reduced-motion close); new pointerdowns are ignored from then on.
  const closingRef = useRef(false)
  // Set when a locked dismiss drag ends, so the matching touchend can cancel
  // the synthesized click.
  const suppressClickRef = useRef(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current != null) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
  }, [])

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current != null) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
  }, [])

  // Drop the settle transition now (spring-back finished or interrupted).
  const endSettle = useCallback(() => {
    clearSettleTimer()
    setSettling(false)
  }, [clearSettleTimer])

  // Idempotent: transitionend and the fallback timer both call this, and only
  // the first wins, so the viewer never double-closes.
  const finishDismiss = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    clearDismissTimer()
    onDismiss()
  }, [clearDismissTimer, onDismiss])

  // Clear any pending fallback timers if the viewer unmounts first.
  useEffect(() => () => { clearDismissTimer(); clearSettleTimer() }, [clearDismissTimer, clearSettleTimer])

  // Mirror the settling flag to the parent so the backdrop can fade smoothly
  // during a settle (spring-back / animate-out) but track the finger 1:1 while
  // dragging.
  useEffect(() => { onSettleChange(settling) }, [settling, onSettleChange])

  const resetDismissDrag = useCallback(() => {
    dismissRef.current = null
    endSettle()
    setDismissOffset(0)
    onDragProgress(0)
  }, [endSettle, onDragProgress])

  const applyDismissOffset = useCallback((offsetY: number) => {
    setDismissOffset(offsetY)
    onDragProgress(dragProgress(Math.max(0, offsetY)))
  }, [onDragProgress])

  const updateTransform = useCallback((next: ImageTransform) => {
    transformRef.current = next
    setTransform(next)
  }, [])

  const clampTransform = useCallback((next: ImageTransform): ImageTransform => {
    const scale = Math.max(MIN_IMAGE_SCALE, Math.min(MAX_IMAGE_SCALE, next.scale))
    const rect = viewportRef.current?.getBoundingClientRect()
    // Keep the image available for panning without allowing it to drift
    // completely out of the viewport. The image's object-contain bounds are
    // no larger than the viewport, so this is a safe upper bound for either axis.
    const maxX = rect ? Math.max(0, rect.width * (scale - 1) / 2) : 0
    const maxY = rect ? Math.max(0, rect.height * (scale - 1) / 2) : 0
    return {
      scale,
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    }
  }, [])

  const localPoint = useCallback((event: ReactPointerEvent<HTMLDivElement>): PointerPoint => {
    const rect = viewportRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }, [])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    // Once a release committed to dismissing, a re-touch must not grab the
    // photo mid animate-out (it would jump back under the finger).
    if (closingRef.current) return
    suppressClickRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = localPoint(event)
    const pointers = pointersRef.current
    pointers.set(event.pointerId, point)
    const points = [...pointers.values()]
    const current = transformRef.current
    if (points.length >= 2) {
      // A pinch cancels any in-flight dismiss drag and springs the photo back.
      if (dismissRef.current) resetDismissDrag()
      const [first, second] = points
      gestureRef.current = {
        kind: 'pinch',
        startCenter: centerOfPoints([first, second]),
        startDistance: Math.max(1, distanceBetween(first, second)),
        startTransform: current,
      }
      return
    }
    // Only base zoom may swipe-to-dismiss; when zoomed the single pointer pans.
    if (current.scale <= MIN_IMAGE_SCALE) {
      // A fresh drag interrupts any in-flight spring-back: drop the transition
      // so it tracks the finger 1:1 again (a no-op when not settling).
      endSettle()
      dismissRef.current = {
        pointerId: event.pointerId,
        startPoint: point,
        locked: false,
        offsetY: 0,
        samples: [{ y: point.y, t: event.timeStamp }],
        lastTime: event.timeStamp,
      }
    }
    gestureRef.current = { kind: 'pan', startPoint: point, startTransform: current }
  }, [endSettle, localPoint, resetDismissDrag])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    const point = localPoint(event)
    pointersRef.current.set(event.pointerId, point)
    const points = [...pointersRef.current.values()]
    const gesture = gestureRef.current

    // Swipe-down-to-dismiss takes priority over pan while a single pointer is
    // down at base zoom. Once it locks vertical-down it owns the gesture.
    const dismiss = dismissRef.current
    if (dismiss && points.length === 1 && event.pointerId === dismiss.pointerId) {
      const delta = { dx: point.x - dismiss.startPoint.x, dy: point.y - dismiss.startPoint.y }
      dismiss.samples = appendVelocitySample(dismiss.samples, { y: point.y, t: event.timeStamp })
      dismiss.lastTime = event.timeStamp
      if (!dismiss.locked) {
        const axis = resolveDragAxis(delta, DIRECTION_SLOP_PX)
        if (axis === 'horizontal') {
          // Horizontal wins the direction lock: stop tracking a dismiss for
          // this drag and let the pointer fall through to the pan branch below
          // (a no-op at base zoom). The viewport keeps touch-none and pointer
          // capture, so the gesture is NOT handed to a native edge swipe.
          dismissRef.current = null
        } else if (isDismissibleDrag(delta, DIRECTION_SLOP_PX)) {
          dismiss.locked = true
        }
      }
      if (dismissRef.current?.locked) {
        const offsetY = offsetForDrag(delta.dy)
        dismiss.offsetY = offsetY
        applyDismissOffset(offsetY)
        return
      }
    }

    if (!gesture) return

    if (points.length >= 2 && gesture.kind === 'pinch') {
      const [first, second] = points
      const center = centerOfPoints([first, second])
      const distance = distanceBetween(first, second)
      const nextScale = gesture.startTransform.scale * (distance / gesture.startDistance)
      const ratio = nextScale / gesture.startTransform.scale
      const rect = viewportRef.current?.getBoundingClientRect()
      const viewportCenter = { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 }
      const centerDelta = {
        x: center.x - gesture.startCenter.x,
        y: center.y - gesture.startCenter.y,
      }
      const zoomAnchor = {
        x: gesture.startCenter.x - viewportCenter.x - gesture.startTransform.x,
        y: gesture.startCenter.y - viewportCenter.y - gesture.startTransform.y,
      }
      updateTransform(clampTransform({
        scale: nextScale,
        x: gesture.startTransform.x + centerDelta.x + zoomAnchor.x * (1 - ratio),
        y: gesture.startTransform.y + centerDelta.y + zoomAnchor.y * (1 - ratio),
      }))
      return
    }

    if (points.length === 1 && gesture.kind === 'pan') {
      updateTransform(clampTransform({
        ...transformRef.current,
        x: gesture.startTransform.x + point.x - gesture.startPoint.x,
        y: gesture.startTransform.y + point.y - gesture.startPoint.y,
      }))
    }
  }, [applyDismissOffset, clampTransform, localPoint, updateTransform])

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    pointersRef.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)

    const dismiss = dismissRef.current
    if (dismiss && event.pointerId === dismiss.pointerId) {
      dismissRef.current = null
      if (dismiss.locked) {
        const viewportHeight = viewportRef.current?.getBoundingClientRect().height ?? window.innerHeight ?? 0
        // Windowed release velocity (not the last single move), zeroed when
        // the finger was held still before lifting.
        const velocityY = effectiveVelocity(windowVelocity(dismiss.samples), event.timeStamp - dismiss.lastTime)
        const dismissing = shouldDismissOnRelease({
          offsetY: dismiss.offsetY,
          velocityY,
          viewportHeight,
        })
        // The drag ended on the viewer: cancel the click iOS would synthesize
        // from this touch (see handleTouchEnd).
        suppressClickRef.current = true
        if (dismissing) {
          closingRef.current = true
          clearDismissTimer()
          if (prefersReducedMotion()) {
            // No animation, but do not unmount inside pointerup: keep the
            // viewer until the synthesized click would have fired, so it
            // cannot land on the chat bubble behind and reopen the photo.
            dismissTimerRef.current = setTimeout(finishDismiss, REDUCED_MOTION_CLOSE_DELAY_MS)
          } else {
            // Settle: run the animate-out transition, then close on whichever
            // fires first — transitionend or the fallback timer (which covers
            // an interrupted or no-op transition). finishDismiss is idempotent.
            setSettling(true)
            setAnimateOut(true)
            setDismissOffset(viewportHeight || dismiss.offsetY)
            onDragProgress(1)
            dismissTimerRef.current = setTimeout(finishDismiss, DISMISS_ANIMATION_MS)
          }
          return
        }
        // Spring back with a transition. The fallback timer clears `settling`
        // when no transitionend arrives (offset already 0, interrupted).
        setSettling(true)
        applyDismissOffset(0)
        clearSettleTimer()
        settleTimerRef.current = setTimeout(endSettle, SETTLE_FALLBACK_MS)
      }
    }

    const remaining = [...pointersRef.current.values()]
    if (remaining.length === 1) {
      gestureRef.current = { kind: 'pan', startPoint: remaining[0], startTransform: transformRef.current }
    } else if (!remaining.length) {
      gestureRef.current = null
    }
  }, [applyDismissOffset, clearDismissTimer, clearSettleTimer, endSettle, finishDismiss, onDragProgress])

  // React's onTouchEnd is not passive, so preventDefault() here cancels the
  // mouse/click events WKWebView would synthesize from a touch that ended a
  // dismiss drag (or landed while the viewer is closing).
  const handleTouchEnd = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (suppressClickRef.current || closingRef.current) {
      if (event.cancelable) event.preventDefault()
      if (!event.touches.length) suppressClickRef.current = false
    }
  }, [])

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    pointersRef.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (dismissRef.current?.pointerId === event.pointerId) resetDismissDrag()
    if (!pointersRef.current.size) gestureRef.current = null
  }, [resetDismissDrag])

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    // Trackpad pinch gestures arrive as a ctrl/meta wheel on desktop browsers.
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    event.stopPropagation()
    const rect = viewportRef.current?.getBoundingClientRect()
    const point = { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
    const current = transformRef.current
    const nextScale = Math.max(MIN_IMAGE_SCALE, Math.min(MAX_IMAGE_SCALE, current.scale * (event.deltaY < 0 ? 1.15 : 0.87)))
    const ratio = nextScale / current.scale
    const center = { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 }
    updateTransform(clampTransform({
      scale: nextScale,
      x: point.x - center.x - ratio * (point.x - center.x - current.x),
      y: point.y - center.y - ratio * (point.y - center.y - current.y),
    }))
  }, [clampTransform, updateTransform])

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const current = transformRef.current
    updateTransform(clampTransform({ scale: current.scale > MIN_IMAGE_SCALE ? MIN_IMAGE_SCALE : 2, x: 0, y: 0 }))
  }, [clampTransform, updateTransform])

  const dragScale = scaleForProgress(dragProgress(Math.max(0, dismissOffset)))
  const composedTransform = `translate3d(${transform.x}px, ${transform.y + dismissOffset}px, 0) scale(${transform.scale * dragScale})`

  return <div ref={viewportRef} role="img" aria-label={alt} tabIndex={0}
    className="relative flex h-full w-full touch-none select-none items-center justify-center overflow-hidden bg-black"
    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd}
    onPointerCancel={handlePointerCancel} onWheel={handleWheel} onDoubleClick={handleDoubleClick}
    onTouchStart={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()}
    onTouchEnd={handleTouchEnd} onTouchCancel={event => event.stopPropagation()}>
    {/* The authenticated image endpoint must bypass image optimization and retain cookies. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} width={width} height={height} draggable={false} onError={onError}
      onTransitionEnd={event => {
        if (event.propertyName !== 'transform') return
        if (animateOut) finishDismiss()
        else endSettle() // spring-back finished; drop the transition again
      }}
      className="max-h-full max-w-full object-contain will-change-transform"
      style={{
        transform: composedTransform,
        transformOrigin: 'center',
        // Transition ONLY while settling a released drag; pinch, pan and
        // double-click zoom keep the original 1:1, no-transition behavior.
        transition: settling ? 'transform 200ms ease-out' : undefined,
      }} />
  </div>
}

/**
 * Where a chat photo is loaded from. Default: the member-session image route
 * of the app API. The admin inbox reads rooms without a member session, so
 * it supplies its own proxy URL, either per bubble (`src`) or for every
 * bubble below a provider (the bubbles it renders through ChatBubble).
 */
export type ConversationImageSrcResolver = (image: ConversationMessageImage) => string | null | undefined

const ConversationImageSrcContext = createContext<ConversationImageSrcResolver | null>(null)

export function ConversationImageSrcProvider({ resolve, children }: { resolve: ConversationImageSrcResolver; children: ReactNode }) {
  return <ConversationImageSrcContext.Provider value={resolve}>{children}</ConversationImageSrcContext.Provider>
}

function withRetryParam(path: string, retry: number): string {
  if (!retry) return path
  return `${path}${path.includes('?') ? '&' : '?'}retry=${retry}`
}

export default function ConversationImageBubble({ image, locale, src: srcOverride }: {
  image: ConversationMessageImage
  locale: string
  /** Optional image URL; defaults to the app API's member image route. */
  src?: string | null
}) {
  const copy = resolveConversationImageCopy(locale)
  const resolveSrc = useContext(ConversationImageSrcContext)
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [dragProgressValue, setDragProgressValue] = useState(0)
  const [backdropSettling, setBackdropSettling] = useState(false)
  const close = useCallback(() => { setDragProgressValue(0); setBackdropSettling(false); setExpanded(false) }, [])
  const path = srcOverride?.trim()
    || resolveSrc?.(image)?.trim()
    || buildClientApiPath(`/conversations/${encodeURIComponent(image.conversationId)}/images/${encodeURIComponent(image.messageId)}`)
  const src = withRetryParam(path, retry)
  return <>
    <CopyableBubbleSurface text={typeof window === 'undefined' ? path : new URL(path, window.location.origin).href} copyBubbleLabel={copy.copyLink}
      onActivate={() => { if (!failed) setExpanded(true) }} role="button" aria-label={copy.image}
      className="w-[240px] max-w-full shrink overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
      {failed ? <div className="p-4 text-sm text-slate-500"><p>{copy.loadError}</p><button type="button" className="min-h-11 text-sky-700" onClick={event => { event.stopPropagation(); setFailed(false); setRetry(value => value + 1) }}>{copy.retry}</button></div> :
        // This authenticated endpoint must bypass image optimization and retain cookies.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={copy.image} width={image.width} height={image.height} loading="lazy" draggable={false}
          className="max-h-80 w-full object-contain" onError={() => setFailed(true)} />}
    </CopyableBubbleSurface>
    {expanded && <MessageMediaDialog title={copy.image} onClose={close} dark
      backdropOpacity={0.95 * backdropOpacityForProgress(dragProgressValue)} backdropTransition={backdropSettling}>
      <div className="relative h-[80dvh] min-h-[240px] w-full overflow-hidden">
        <button type="button" aria-label={copy.close} onClick={close} className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15"><X size={22} /></button>
        <ZoomableConversationImage src={src} alt={copy.image} width={image.width} height={image.height}
          onError={() => { setFailed(true); setExpanded(false) }}
          onDismiss={close} onDragProgress={setDragProgressValue} onSettleChange={setBackdropSettling} />
      </div>
    </MessageMediaDialog>}
  </>
}
