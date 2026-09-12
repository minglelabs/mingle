'use client'
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { X } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { conversationImageCopy, type ConversationMessageImage } from '@/lib/conversation-image'
import CopyableBubbleSurface from './CopyableBubbleSurface'
import MessageMediaDialog from './MessageMediaDialog'

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

function ZoomableConversationImage({ src, alt, width, height, onError }: {
  src: string; alt: string; width: number; height: number; onError: () => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointersRef = useRef<Map<number, PointerPoint>>(new Map())
  const gestureRef = useRef<GestureState | null>(null)
  const transformRef = useRef<ImageTransform>(INITIAL_IMAGE_TRANSFORM)
  const [transform, setTransform] = useState<ImageTransform>(INITIAL_IMAGE_TRANSFORM)

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
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = localPoint(event)
    const pointers = pointersRef.current
    pointers.set(event.pointerId, point)
    const points = [...pointers.values()]
    const current = transformRef.current
    if (points.length >= 2) {
      const [first, second] = points
      gestureRef.current = {
        kind: 'pinch',
        startCenter: centerOfPoints([first, second]),
        startDistance: Math.max(1, distanceBetween(first, second)),
        startTransform: current,
      }
      return
    }
    gestureRef.current = { kind: 'pan', startPoint: point, startTransform: current }
  }, [localPoint])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    const point = localPoint(event)
    pointersRef.current.set(event.pointerId, point)
    const points = [...pointersRef.current.values()]
    const gesture = gestureRef.current
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
  }, [clampTransform, localPoint, updateTransform])

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    pointersRef.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const remaining = [...pointersRef.current.values()]
    if (remaining.length === 1) {
      gestureRef.current = { kind: 'pan', startPoint: remaining[0], startTransform: transformRef.current }
    } else if (!remaining.length) {
      gestureRef.current = null
    }
  }, [])

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

  return <div ref={viewportRef} role="img" aria-label={alt} tabIndex={0}
    className="relative flex h-full w-full touch-none select-none items-center justify-center overflow-hidden bg-black"
    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd}
    onPointerCancel={handlePointerEnd} onWheel={handleWheel} onDoubleClick={handleDoubleClick}
    onTouchStart={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()}
    onTouchEnd={event => event.stopPropagation()} onTouchCancel={event => event.stopPropagation()}>
    {/* The authenticated image endpoint must bypass image optimization and retain cookies. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} width={width} height={height} draggable={false} onError={onError}
      className="max-h-full max-w-full object-contain will-change-transform"
      style={{ transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`, transformOrigin: 'center' }} />
  </div>
}

export default function ConversationImageBubble({ image, locale }: { image: ConversationMessageImage; locale: string }) {
  const copy = conversationImageCopy(locale)
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const close = useCallback(() => setExpanded(false), [])
  const path = buildClientApiPath(`/conversations/${encodeURIComponent(image.conversationId)}/images/${encodeURIComponent(image.messageId)}`)
  const src = retry ? `${path}?retry=${retry}` : path
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
    {expanded && <MessageMediaDialog title={copy.image} onClose={close} dark>
      <div className="relative h-[80dvh] min-h-[240px] w-full overflow-hidden">
        <button type="button" aria-label={copy.close} onClick={close} className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15"><X size={22} /></button>
        <ZoomableConversationImage src={src} alt={copy.image} width={image.width} height={image.height}
          onError={() => { setFailed(true); setExpanded(false) }} />
      </div>
    </MessageMediaDialog>}
  </>
}
