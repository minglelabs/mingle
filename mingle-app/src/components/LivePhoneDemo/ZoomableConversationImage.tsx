'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type TouchEvent as ReactTouchEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { containFit, type Size } from './photo-translation-geometry.logic'
import {
  appendPositionSample,
  windowPositionVelocity,
  type PositionSample,
} from './photo-viewer-pager.logic'
import {
  DIRECTION_SLOP_PX,
  appendVelocitySample,
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
  /** Screen position at pointer down: the page track moves under the slide, so a horizontal drag is measured on screen. */
  startClientX: number
  locked: boolean
  offsetY: number
  /** Recent pointer samples for the windowed release velocity. */
  samples: VelocitySample[]
  lastTime: number
}

// A drag that went horizontal at base zoom turns the page (the viewer owns the track).
type PagerDrag = {
  pointerId: number
  startClientX: number
  offsetX: number
  samples: PositionSample[]
  lastTime: number
}

/** What the viewer needs from a slide to page between photos with a horizontal drag. */
export type ConversationImagePagerHandlers = {
  /** The live horizontal finger offset in px (negative is leftwards). */
  onDrag: (offsetX: number) => void
  /** The finger lifted: its offset, windowed velocity (px/ms) and the slide width. */
  onRelease: (release: { offsetX: number; velocityX: number; width: number }) => void
  /** The drag was interrupted by a pinch or a cancel: spring back. */
  onCancel: () => void
}

/** The painted photo inside the viewer: its contain-fit size in px and the loaded img. */
export type ConversationImageStage = Size & { image: HTMLImageElement }

export function ZoomableConversationImage({ src, alt, width, height, onError, onDismiss, onDragProgress, onSettleChange, renderOverlay, active = true, pager, failure }: {
  src: string; alt: string; width: number; height: number; onError: () => void
  onDismiss: () => void; onDragProgress: (progress: number) => void; onSettleChange: (settling: boolean) => void
  /** Content painted over the photo; it shares the stage transform (pinch, pan, dismiss). */
  renderOverlay?: (stage: ConversationImageStage) => ReactNode
  /** False for a neighbouring slide the viewer keeps mounted: it resets to base zoom and stays quiet. */
  active?: boolean
  /** Without it a horizontal drag at base zoom does nothing (a single photo). */
  pager?: ConversationImagePagerHandlers
  /** Shown instead of the photo when it failed to load; the slide still takes drags so paging works. */
  failure?: ReactNode
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointersRef = useRef<Map<number, PointerPoint>>(new Map())
  const gestureRef = useRef<GestureState | null>(null)
  const transformRef = useRef<ImageTransform>(INITIAL_IMAGE_TRANSFORM)
  const [transform, setTransform] = useState<ImageTransform>(INITIAL_IMAGE_TRANSFORM)
  // The stage is the photo's contain-fit rect in px, so an overlay placed in
  // percent lines up with the painted pixels. An object-contain img box does
  // not: tall photos letterbox INSIDE the img box (R3 §1 probe).
  const [viewportSize, setViewportSize] = useState<Size | null>(null)
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null)
  // True while any pointer is down; with `settling` it scopes will-change so
  // zoomed text re-rasterizes crisp once the gesture ends.
  const [interacting, setInteracting] = useState(false)
  // Swipe-down-to-dismiss drag state (base zoom only).
  const dismissRef = useRef<DismissDrag | null>(null)
  const pagerDragRef = useRef<PagerDrag | null>(null)
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

  // Size the stage before the first paint, then follow viewport resizes
  // (rotation, the desktop window).
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => {
      const next = { width: viewport.clientWidth, height: viewport.clientHeight }
      setViewportSize(current => current?.width === next.width && current.height === next.height ? current : next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  // Mirror the settling flag to the parent so the backdrop can fade smoothly
  // during a settle (spring-back / animate-out) but track the finger 1:1 while
  // dragging. Only the slide on screen speaks for the backdrop.
  useEffect(() => { if (active) onSettleChange(settling) }, [active, settling, onSettleChange])

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

  // A slide the viewer paged away from goes back to base zoom, so coming back to it starts fresh.
  useEffect(() => {
    if (active) return
    pointersRef.current.clear()
    gestureRef.current = null
    pagerDragRef.current = null
    setInteracting(false)
    updateTransform(INITIAL_IMAGE_TRANSFORM)
    if (dismissRef.current || dismissOffset !== 0) {
      dismissRef.current = null
      endSettle()
      setDismissOffset(0)
    }
    // dismissOffset is read once, to know whether a drag was left over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, endSettle, updateTransform])

  const clampTransform = useCallback((next: ImageTransform): ImageTransform => {
    const scale = Math.max(MIN_IMAGE_SCALE, Math.min(MAX_IMAGE_SCALE, next.scale))
    const rect = viewportRef.current?.getBoundingClientRect()
    // Keep the image available for panning without allowing it to drift
    // completely out of the viewport. The contain-fit stage is no larger than
    // the viewport, so this is a safe upper bound for either axis.
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
    setInteracting(true)
    const points = [...pointers.values()]
    const current = transformRef.current
    if (points.length >= 2) {
      // A pinch cancels any in-flight dismiss or page drag and springs the photo back.
      if (dismissRef.current) resetDismissDrag()
      if (pagerDragRef.current) {
        pagerDragRef.current = null
        pager?.onCancel()
      }
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
        startClientX: event.clientX,
        locked: false,
        offsetY: 0,
        samples: [{ y: point.y, t: event.timeStamp }],
        lastTime: event.timeStamp,
      }
    }
    gestureRef.current = { kind: 'pan', startPoint: point, startTransform: current }
  }, [endSettle, localPoint, pager, resetDismissDrag])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    const point = localPoint(event)
    pointersRef.current.set(event.pointerId, point)
    const points = [...pointersRef.current.values()]
    const gesture = gestureRef.current

    // A drag that already went horizontal keeps turning the page.
    const pagerDrag = pagerDragRef.current
    if (pagerDrag && points.length === 1 && event.pointerId === pagerDrag.pointerId) {
      pagerDrag.offsetX = event.clientX - pagerDrag.startClientX
      pagerDrag.samples = appendPositionSample(pagerDrag.samples, { pos: event.clientX, t: event.timeStamp })
      pagerDrag.lastTime = event.timeStamp
      pager?.onDrag(pagerDrag.offsetX)
      return
    }

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
          // Horizontal wins the direction lock: stop tracking a dismiss for this
          // drag. With several photos it turns the page; alone it falls through to
          // the pan branch below (a no-op at base zoom). Either way the viewport
          // keeps touch-none and pointer capture, so the gesture is NOT handed to
          // a native edge swipe.
          dismissRef.current = null
          if (pager && transformRef.current.scale <= MIN_IMAGE_SCALE) {
            const drag: PagerDrag = {
              pointerId: dismiss.pointerId,
              startClientX: dismiss.startClientX,
              offsetX: event.clientX - dismiss.startClientX,
              samples: [{ pos: dismiss.startClientX, t: dismiss.samples[0]?.t ?? event.timeStamp }],
              lastTime: event.timeStamp,
            }
            drag.samples = appendPositionSample(drag.samples, { pos: event.clientX, t: event.timeStamp })
            pagerDragRef.current = drag
            pager.onDrag(drag.offsetX)
            return
          }
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
  }, [applyDismissOffset, clampTransform, localPoint, pager, updateTransform])

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    pointersRef.current.delete(event.pointerId)
    if (!pointersRef.current.size) setInteracting(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)

    const pagerDrag = pagerDragRef.current
    if (pagerDrag && event.pointerId === pagerDrag.pointerId) {
      pagerDragRef.current = null
      // Windowed release velocity, zeroed when the finger was held still before lifting.
      const velocityX = effectiveVelocity(windowPositionVelocity(pagerDrag.samples), event.timeStamp - pagerDrag.lastTime)
      // The drag ended on the viewer: cancel the click iOS would synthesize from this touch.
      suppressClickRef.current = true
      pager?.onRelease({ offsetX: pagerDrag.offsetX, velocityX, width: viewportRef.current?.getBoundingClientRect().width ?? 0 })
    }

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
  }, [applyDismissOffset, clearDismissTimer, clearSettleTimer, endSettle, finishDismiss, onDragProgress, pager])

  // React's onTouchEnd is not passive, so preventDefault() here cancels the
  // mouse/click events WKWebView would synthesize from a touch that ended a
  // dismiss or page drag (or landed while the viewer is closing).
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
    if (!pointersRef.current.size) setInteracting(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (pagerDragRef.current?.pointerId === event.pointerId) {
      pagerDragRef.current = null
      pager?.onCancel()
    }
    if (dismissRef.current?.pointerId === event.pointerId) resetDismissDrag()
    if (!pointersRef.current.size) gestureRef.current = null
  }, [pager, resetDismissDrag])

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
  const stage = viewportSize ? containFit({ width, height }, viewportSize) : null

  // No background of its own: the dialog's backdrop is the only dark layer, so it can fade while the
  // photo is dragged away and nothing is left behind. Vertical overflow stays visible for the same reason.
  return <div ref={viewportRef} role="img" aria-label={alt} aria-hidden={active ? undefined : true} tabIndex={active ? 0 : -1}
    className="relative flex h-full w-full touch-none select-none items-center justify-center"
    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd}
    onPointerCancel={handlePointerCancel} onWheel={handleWheel} onDoubleClick={handleDoubleClick}
    onTouchStart={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()}
    onTouchEnd={handleTouchEnd} onTouchCancel={event => event.stopPropagation()}>
    {/* The stage carries the transform so the photo and its overlay move as one. */}
    <div data-conversation-image-stage className="relative shrink-0"
      onTransitionEnd={event => {
        // Only the stage's own transform; a transition bubbling up from the
        // overlay must not finish a dismiss or end a settle.
        if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
        if (animateOut) finishDismiss()
        else endSettle() // spring-back finished; drop the transition again
      }}
      style={{
        width: stage?.width ?? 0,
        height: stage?.height ?? 0,
        transform: composedTransform,
        transformOrigin: 'center',
        // Transition ONLY while settling a released drag; pinch, pan and
        // double-click zoom keep the original 1:1, no-transition behavior.
        transition: settling ? 'transform 200ms ease-out' : undefined,
        // Composite only while moving: a permanent layer keeps zoomed text
        // rasterized at the base scale (blurry at 4x).
        willChange: interacting || settling ? 'transform' : undefined,
      }}>
      {/* The authenticated image endpoint must bypass image optimization and retain cookies. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={width} height={height} draggable={false} onError={onError}
        onLoad={event => setLoadedImage(event.currentTarget)}
        className={failure ? 'invisible block h-full w-full' : 'block h-full w-full'} />
      {!failure && renderOverlay && stage && stage.width > 0 && loadedImage
        ? renderOverlay({ width: stage.width, height: stage.height, image: loadedImage })
        : null}
    </div>
    {failure}
  </div>
}
