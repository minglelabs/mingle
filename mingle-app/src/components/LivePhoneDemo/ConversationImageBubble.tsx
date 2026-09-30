'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type TouchEvent as ReactTouchEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { buildClientApiPath, clientApiNamespace } from '@/lib/api-contract'
import { type ConversationMessageImage } from '@/lib/conversation-image'
import { overlayBlocksFor, type ConversationImageTextBlock } from '@/lib/conversation-image-text'
import { resolveConversationImageCopy, type ConversationImageCopy } from '@/i18n/conversation-image-copy'
import CopyableBubbleSurface from './CopyableBubbleSurface'
import MessageMediaDialog from './MessageMediaDialog'
import PhotoTranslateControl from './PhotoTranslateControl'
import PhotoTranslationOverlay from './PhotoTranslationOverlay'
import { usePhotoTranslationRoom, type PhotoTranslationRoom } from './photo-translation-context'
import { containFit, type Size } from './photo-translation-geometry.logic'
import {
  PHOTO_TRANSLATION_OFF,
  buildPhotoTranslationOrder,
  photoTranslationMemoryKey,
  photoTranslationSelections,
  resolvePhotoTranslationKeyedSnapshot,
  resolvePhotoTranslationToggle,
  type PhotoTranslationKeyedSnapshot,
  type PhotoTranslationChoice,
} from './photo-translation-toggle.logic'
import { usePhotoTranslationText } from './use-photo-translation-text'
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

/** The painted photo inside the viewer: its contain-fit size in px and the loaded img. */
export type ConversationImageStage = Size & { image: HTMLImageElement }

export function ZoomableConversationImage({ src, alt, width, height, onError, onDismiss, onDragProgress, onSettleChange, renderOverlay }: {
  src: string; alt: string; width: number; height: number; onError: () => void
  onDismiss: () => void; onDragProgress: (progress: number) => void; onSettleChange: (settling: boolean) => void
  /** Content painted over the photo; it shares the stage transform (pinch, pan, dismiss). */
  renderOverlay?: (stage: ConversationImageStage) => ReactNode
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
    if (!pointersRef.current.size) setInteracting(false)
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
    if (!pointersRef.current.size) setInteracting(false)
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
  const stage = viewportSize ? containFit({ width, height }, viewportSize) : null

  return <div ref={viewportRef} role="img" aria-label={alt} tabIndex={0}
    className="relative flex h-full w-full touch-none select-none items-center justify-center overflow-hidden bg-black"
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
        className="block h-full w-full" />
      {renderOverlay && stage && stage.width > 0 && loadedImage
        ? renderOverlay({ width: stage.width, height: stage.height, image: loadedImage })
        : null}
    </div>
  </div>
}

const NO_BLOCKS: readonly ConversationImageTextBlock[] = []

type ViewerCallbacks = {
  onError: () => void
  onDismiss: () => void
  onDragProgress: (progress: number) => void
  onSettleChange: (settling: boolean) => void
}

/**
 * The viewer with photo text translation (spec §4): the data hook runs only
 * while this is mounted (the viewer is open), the overlay rides the stage,
 * and the pill sits beside the viewport, never inside it.
 */
function PhotoTranslationViewer({ room, image, src, alt, copy, dragProgress, onError, onDismiss, onDragProgress, onSettleChange }: ViewerCallbacks & {
  room: PhotoTranslationRoom; image: ConversationMessageImage; src: string; alt: string; copy: ConversationImageCopy; dragProgress: number
}) {
  const reducedMotion = useReducedMotion() ?? false
  const order = useMemo(() => buildPhotoTranslationOrder(room.roomLanguages, room.defaultLanguage), [room.roomLanguages, room.defaultLanguage])
  const response = usePhotoTranslationText({ conversationId: image.conversationId, messageId: image.messageId, languages: order, viewerUserId: room.viewerUserId })
  const memoryKey = photoTranslationMemoryKey({ apiNamespace: clientApiNamespace, viewerUserId: room.viewerUserId, conversationId: image.conversationId, messageId: image.messageId })
  const [selectionSnapshot, setSelectionSnapshot] = useState<PhotoTranslationKeyedSnapshot<PhotoTranslationChoice | null>>(
    () => ({ key: memoryKey, value: photoTranslationSelections.get(memoryKey) ?? null }),
  )
  const selection = resolvePhotoTranslationKeyedSnapshot(
    selectionSnapshot,
    memoryKey,
    key => photoTranslationSelections.get(key) ?? null,
  )
  const toggle = useMemo(() => resolvePhotoTranslationToggle({ order, response, selection }), [order, response, selection])
  const language = toggle.choice === PHOTO_TRANSLATION_OFF ? null : toggle.choice
  const painted = useMemo(() => overlayBlocksFor(response, language), [response, language])
  const blocks = response?.blocks ?? NO_BLOCKS
  const select = useCallback((choice: PhotoTranslationChoice) => {
    photoTranslationSelections.set(memoryKey, choice)
    setSelectionSnapshot({ key: memoryKey, value: choice })
  }, [memoryKey])
  const renderOverlay = useCallback((stage: ConversationImageStage) => <PhotoTranslationOverlay
    width={stage.width} height={stage.height} blocks={blocks} painted={painted}
    language={language} reducedMotion={reducedMotion} />, [blocks, language, painted, reducedMotion])
  return <>
    <ZoomableConversationImage src={src} alt={alt} width={image.width} height={image.height} onError={onError}
      onDismiss={onDismiss} onDragProgress={onDragProgress} onSettleChange={onSettleChange} renderOverlay={renderOverlay} />
    <AnimatePresence initial={false}>
      {toggle.visible && <motion.div key="photo-translate" className="pointer-events-none absolute bottom-5 left-0 right-0 z-10 flex justify-center"
        initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.96 }}
        transition={{ duration: reducedMotion ? 0 : 0.18, ease: 'easeOut' }}>
        <PhotoTranslateControl options={toggle.options} cycle={toggle.cycle} choice={toggle.choice} pending={toggle.pending}
          uiLocale={room.uiLocale} copy={copy} disabled={dragProgress > 0} onSelect={select} />
      </motion.div>}
    </AnimatePresence>
    {/* The viewport is role="img", which hides the overlay from assistive tech; read the translation here. */}
    {painted.length > 0 && <div className="sr-only" lang={language ?? undefined}>
      {painted.map(({ block, text }) => <p key={block.id} dir="auto">{text}</p>)}
    </div>}
  </>
}

export default function ConversationImageBubble({ image, locale }: { image: ConversationMessageImage; locale: string }) {
  const copy = resolveConversationImageCopy(locale)
  // Only the LivePhoneDemo chat list provides a room; share, spectate and
  // legacy screens get no pill and no request.
  const room = usePhotoTranslationRoom()
  const translationRoom = room?.conversationId === image.conversationId ? room : null
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [dragProgressValue, setDragProgressValue] = useState(0)
  const [backdropSettling, setBackdropSettling] = useState(false)
  const close = useCallback(() => { setDragProgressValue(0); setBackdropSettling(false); setExpanded(false) }, [])
  const path = buildClientApiPath(`/conversations/${encodeURIComponent(image.conversationId)}/images/${encodeURIComponent(image.messageId)}`)
  const src = retry ? `${path}?retry=${retry}` : path
  const viewerCallbacks: ViewerCallbacks = {
    onError: () => { setFailed(true); setExpanded(false) },
    onDismiss: close,
    onDragProgress: setDragProgressValue,
    onSettleChange: setBackdropSettling,
  }
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
        {translationRoom
          ? <PhotoTranslationViewer room={translationRoom} image={image} src={src} alt={copy.image} copy={copy}
            dragProgress={dragProgressValue} {...viewerCallbacks} />
          : <ZoomableConversationImage src={src} alt={copy.image} width={image.width} height={image.height} {...viewerCallbacks} />}
      </div>
    </MessageMediaDialog>}
  </>
}
