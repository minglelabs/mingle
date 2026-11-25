'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Droplets, Loader2, Minus, Pencil, Plus, Smile, Trash2, Undo2, X } from 'lucide-react'

/**
 * Full-screen photo touch-up for staff in the review tool (2026-11-25): draw
 * with a colored pen, blur or pixelate a spot by brushing over it, and put
 * emoji stickers on (drag to move, resize, delete). Everything is drawn on a
 * canvas at the photo's own size (at most 2048 px) and saved as a new JPEG;
 * the original photo file is kept.
 */

type Tool = 'pen' | 'blur' | 'sticker'
type BlurMode = 'blur' | 'mosaic'
type Point = { x: number; y: number }
type Stroke = { kind: 'pen'; color: string; width: number; points: Point[] } | { kind: 'blur'; mode: BlurMode; width: number; points: Point[] }
type Sticker = { id: number; emoji: string; x: number; y: number; size: number }
type Op = { type: 'stroke'; stroke: Stroke } | { type: 'sticker'; id: number }

const MAX_SIDE = 2048
const COLORS = ['#111111', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#ec4899']
/** Widths as a share of the photo's long side. */
const PEN_WIDTHS = [{ label: '가늘게', value: 0.004 }, { label: '보통', value: 0.01 }, { label: '굵게', value: 0.022 }]
const BLUR_WIDTHS = [{ label: '작게', value: 0.04 }, { label: '보통', value: 0.08 }, { label: '크게', value: 0.15 }]
const STICKERS = ['😀', '😂', '🥰', '😎', '🙈', '❤️', '💕', '✨', '⭐', '🔥', '👍', '🎉', '🌸', '🍀', '🐱', '🐶', '🐰', '🍓', '☕', '🎀']
const STICKER_SIZE = 0.16

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** The photo blurred (smooth down- and up-scaling) or pixelated, for the blur brush to reveal. */
function softened(base: HTMLCanvasElement, mode: BlurMode): HTMLCanvasElement {
  const longSide = Math.max(base.width, base.height)
  const small = mode === 'blur' ? 48 : 40
  const scale = small / longSide
  const tiny = canvasOf(Math.max(1, Math.round(base.width * scale)), Math.max(1, Math.round(base.height * scale)))
  const tinyCtx = tiny.getContext('2d')!
  tinyCtx.imageSmoothingEnabled = true
  tinyCtx.imageSmoothingQuality = 'high'
  if (mode === 'blur') {
    // Two steps down keep the blur smooth instead of blocky.
    const mid = canvasOf(Math.max(1, Math.round(base.width * scale * 4)), Math.max(1, Math.round(base.height * scale * 4)))
    const midCtx = mid.getContext('2d')!
    midCtx.imageSmoothingQuality = 'high'
    midCtx.drawImage(base, 0, 0, mid.width, mid.height)
    tinyCtx.drawImage(mid, 0, 0, tiny.width, tiny.height)
  } else {
    tinyCtx.drawImage(base, 0, 0, tiny.width, tiny.height)
  }
  const out = canvasOf(base.width, base.height)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = mode === 'blur'
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(tiny, 0, 0, out.width, out.height)
  return out
}

function tracePath(ctx: CanvasRenderingContext2D, points: Point[], width: number) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  // A single tap still leaves a dot.
  if (points.length === 1) ctx.lineTo(points[0].x + 0.01, points[0].y)
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y)
  ctx.stroke()
}

export function PhotoMarkupEditor({ src, onCancel, onSave }: {
  src: string
  onCancel: () => void
  /** The edited photo as a JPEG; resolves once it is stored. */
  onSave: (file: File) => Promise<void>
}) {
  const viewRef = useRef<HTMLCanvasElement | null>(null)
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const committedRef = useRef<HTMLCanvasElement | null>(null)
  const softRef = useRef<Partial<Record<BlurMode, HTMLCanvasElement>>>({})
  const strokesRef = useRef<Stroke[]>([])
  const currentRef = useRef<Stroke | null>(null)
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null)
  const nextIdRef = useRef(1)

  const [loaded, setLoaded] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[2])
  const [penWidth, setPenWidth] = useState(PEN_WIDTHS[1].value)
  const [blurMode, setBlurMode] = useState<BlurMode>('blur')
  const [blurWidth, setBlurWidth] = useState(BLUR_WIDTHS[1].value)
  const [emoji, setEmoji] = useState(STICKERS[0])
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [ops, setOps] = useState<Op[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stickersRef = useRef(stickers)
  useEffect(() => { stickersRef.current = stickers }, [stickers])

  const longSide = () => {
    const base = baseRef.current
    return base ? Math.max(base.width, base.height) : 1
  }

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    const base = baseRef.current
    if (!base || stroke.points.length === 0) return
    if (stroke.kind === 'pen') {
      ctx.strokeStyle = stroke.color
      tracePath(ctx, stroke.points, stroke.width)
      return
    }
    const soft = softRef.current[stroke.mode] ??= softened(base, stroke.mode)
    const mask = canvasOf(base.width, base.height)
    const maskCtx = mask.getContext('2d')!
    maskCtx.strokeStyle = '#000'
    tracePath(maskCtx, stroke.points, stroke.width)
    maskCtx.globalCompositeOperation = 'source-in'
    maskCtx.drawImage(soft, 0, 0)
    ctx.drawImage(mask, 0, 0)
  }, [])

  /** The photo with every finished stroke (stickers are drawn on top each frame). */
  const rebuildCommitted = useCallback(() => {
    const base = baseRef.current
    const committed = committedRef.current
    if (!base || !committed) return
    const ctx = committed.getContext('2d')!
    ctx.clearRect(0, 0, committed.width, committed.height)
    ctx.drawImage(base, 0, 0)
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke)
  }, [drawStroke])

  const paint = useCallback((target?: HTMLCanvasElement, withSelection = true) => {
    const view = target ?? viewRef.current
    const committed = committedRef.current
    if (!view || !committed) return
    const ctx = view.getContext('2d')!
    ctx.clearRect(0, 0, view.width, view.height)
    ctx.drawImage(committed, 0, 0)
    if (currentRef.current) drawStroke(ctx, currentRef.current)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const sticker of stickersRef.current) {
      ctx.font = `${Math.round(sticker.size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
      ctx.fillText(sticker.emoji, sticker.x, sticker.y)
      if (withSelection && sticker.id === selected) {
        ctx.save()
        ctx.setLineDash([sticker.size * 0.08, sticker.size * 0.06])
        ctx.lineWidth = Math.max(2, sticker.size * 0.02)
        ctx.strokeStyle = '#38bdf8'
        ctx.strokeRect(sticker.x - sticker.size * 0.6, sticker.y - sticker.size * 0.6, sticker.size * 1.2, sticker.size * 1.2)
        ctx.restore()
      }
    }
  }, [drawStroke, selected])

  // Load the photo once (same origin, so the canvas stays exportable).
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      if (cancelled) return
      const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const base = canvasOf(width, height)
      base.getContext('2d')!.drawImage(image, 0, 0, width, height)
      baseRef.current = base
      committedRef.current = canvasOf(width, height)
      if (viewRef.current) {
        viewRef.current.width = width
        viewRef.current.height = height
      }
      rebuildCommitted()
      setLoaded('ready')
    }
    image.onerror = () => { if (!cancelled) setLoaded('failed') }
    image.src = src
    return () => { cancelled = true }
  }, [src, rebuildCommitted])

  useEffect(() => {
    if (loaded === 'ready') paint()
  }, [loaded, paint, stickers, ops])

  // No page scroll or pull-to-refresh behind the editor.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  function toImage(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    const base = baseRef.current!
    return { x: ((event.clientX - rect.left) / rect.width) * base.width, y: ((event.clientY - rect.top) / rect.height) * base.height }
  }

  function stickerAt(point: Point): Sticker | null {
    return [...stickersRef.current].reverse().find((sticker) => Math.abs(point.x - sticker.x) < sticker.size * 0.6 && Math.abs(point.y - sticker.y) < sticker.size * 0.6) ?? null
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (loaded !== 'ready' || saving) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = toImage(event)
    if (tool === 'sticker') {
      const hit = stickerAt(point)
      if (hit) {
        setSelected(hit.id)
        dragRef.current = { id: hit.id, dx: point.x - hit.x, dy: point.y - hit.y }
        return
      }
      const sticker: Sticker = { id: nextIdRef.current++, emoji, x: point.x, y: point.y, size: longSide() * STICKER_SIZE }
      setStickers((current) => [...current, sticker])
      setOps((current) => [...current, { type: 'sticker', id: sticker.id }])
      setSelected(sticker.id)
      dragRef.current = { id: sticker.id, dx: 0, dy: 0 }
      return
    }
    const width = longSide() * (tool === 'pen' ? penWidth : blurWidth)
    currentRef.current = tool === 'pen'
      ? { kind: 'pen', color, width, points: [point] }
      : { kind: 'blur', mode: blurMode, width, points: [point] }
    paint()
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = toImage(event)
    const drag = dragRef.current
    if (drag) {
      setStickers((current) => current.map((sticker) => (sticker.id === drag.id ? { ...sticker, x: point.x - drag.dx, y: point.y - drag.dy } : sticker)))
      return
    }
    const stroke = currentRef.current
    if (!stroke) return
    stroke.points.push(point)
    paint()
  }

  function onPointerUp() {
    dragRef.current = null
    const stroke = currentRef.current
    if (!stroke) return
    currentRef.current = null
    strokesRef.current = [...strokesRef.current, stroke]
    rebuildCommitted()
    setOps((current) => [...current, { type: 'stroke', stroke }])
  }

  function undo() {
    const last = ops.at(-1)
    if (!last) return
    if (last.type === 'stroke') {
      strokesRef.current = strokesRef.current.filter((stroke) => stroke !== last.stroke)
      rebuildCommitted()
    } else {
      setStickers((current) => current.filter((sticker) => sticker.id !== last.id))
      if (selected === last.id) setSelected(null)
    }
    setOps((current) => current.slice(0, -1))
  }

  function resizeSelected(by: number) {
    setStickers((current) => current.map((sticker) => (sticker.id === selected ? { ...sticker, size: Math.max(longSide() * 0.04, Math.min(longSide() * 0.8, sticker.size * by)) } : sticker)))
  }

  function removeSelected() {
    if (selected === null) return
    setStickers((current) => current.filter((sticker) => sticker.id !== selected))
    setOps((current) => current.filter((op) => !(op.type === 'sticker' && op.id === selected)))
    setSelected(null)
  }

  async function save() {
    const base = baseRef.current
    if (!base) return
    setSaving(true)
    setError(null)
    try {
      const out = canvasOf(base.width, base.height)
      paint(out, false)
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) throw new Error('export_failed')
      await onSave(new File([blob], 'edited.jpg', { type: 'image/jpeg' }))
    } catch {
      setError('저장하지 못했어요. 다시 눌러 주세요.')
      setSaving(false)
    }
  }

  const chip = (active: boolean) => `h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${active ? 'bg-white text-slate-900' : 'bg-white/15 text-white'}`
  const toolButton = (key: Tool, label: string, Icon: typeof Pencil) => (
    <button type="button" onClick={() => { setTool(key); if (key !== 'sticker') setSelected(null) }} className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold ${tool === key ? 'bg-white text-slate-900' : 'text-white/80'}`}>
      <Icon className="h-5 w-5" aria-hidden="true" />{label}
    </button>
  )

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[140] flex flex-col bg-black text-white" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header className="flex h-12 shrink-0 items-center justify-between px-3">
        <button type="button" onClick={onCancel} disabled={saving} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold active:bg-white/10">
          <X className="h-4 w-4" aria-hidden="true" />취소
        </button>
        <span className="text-sm font-semibold">사진 편집</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={undo} disabled={!ops.length || saving} aria-label="되돌리기" className="inline-flex h-9 w-9 items-center justify-center rounded-full active:bg-white/10 disabled:opacity-30">
            <Undo2 className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => void save()} disabled={loaded !== 'ready' || !ops.length || saving} className="inline-flex h-9 items-center gap-1 rounded-full bg-sky-500 px-4 text-sm font-semibold disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}저장
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2">
        {loaded === 'loading' ? <Loader2 className="h-6 w-6 animate-spin text-white/70" aria-hidden="true" /> : null}
        {loaded === 'failed' ? <p className="text-sm text-white/80">사진을 불러오지 못했어요.</p> : null}
        <canvas
          ref={viewRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`${loaded === 'ready' ? 'block' : 'hidden'} h-auto max-h-full w-auto max-w-full touch-none select-none`}
          style={{ cursor: tool === 'sticker' ? 'pointer' : 'crosshair' }}
        />
      </div>
      {error ? <p className="px-4 py-1 text-center text-xs text-rose-300">{error}</p> : null}
      <div className="shrink-0 space-y-2 px-3 pb-2 pt-2">
        {tool === 'pen' ? (
          <>
            <div className="flex items-center justify-center gap-2">
              {COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`색 ${value}`}
                  onClick={() => setColor(value)}
                  className={`h-8 w-8 shrink-0 rounded-full border-2 ${color === value ? 'border-sky-400 ring-2 ring-sky-400/60' : 'border-white/40'}`}
                  style={{ backgroundColor: value }}
                />
              ))}
            </div>
            <div className="flex justify-center gap-2">
              {PEN_WIDTHS.map((option) => (
                <button key={option.label} type="button" onClick={() => setPenWidth(option.value)} className={chip(penWidth === option.value)}>{option.label}</button>
              ))}
            </div>
          </>
        ) : null}
        {tool === 'blur' ? (
          <>
            <div className="flex justify-center gap-2">
              <button type="button" onClick={() => setBlurMode('blur')} className={chip(blurMode === 'blur')}>블러</button>
              <button type="button" onClick={() => setBlurMode('mosaic')} className={chip(blurMode === 'mosaic')}>모자이크</button>
            </div>
            <div className="flex justify-center gap-2">
              {BLUR_WIDTHS.map((option) => (
                <button key={option.label} type="button" onClick={() => setBlurWidth(option.value)} className={chip(blurWidth === option.value)}>{option.label}</button>
              ))}
            </div>
            <p className="text-center text-[11px] text-white/60">가릴 곳을 손가락으로 문지르세요.</p>
          </>
        ) : null}
        {tool === 'sticker' ? (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              {STICKERS.map((value) => (
                <button key={value} type="button" onClick={() => setEmoji(value)} className={`h-10 w-10 shrink-0 rounded-xl text-2xl ${emoji === value ? 'bg-white/30 ring-2 ring-sky-400' : 'bg-white/10'}`}>{value}</button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-[11px] text-white/60">{selected === null ? '사진을 누르면 스티커가 붙어요. 끌어서 옮기기.' : '선택한 스티커'}</span>
              {selected !== null ? (
                <>
                  <button type="button" onClick={() => resizeSelected(1 / 1.2)} aria-label="작게" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15"><Minus className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" onClick={() => resizeSelected(1.2)} aria-label="크게" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15"><Plus className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" onClick={removeSelected} aria-label="스티커 지우기" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </>
              ) : null}
            </div>
          </>
        ) : null}
        <div className="flex gap-1 rounded-2xl bg-white/10 p-1">
          {toolButton('pen', '펜', Pencil)}
          {toolButton('blur', '블러', Droplets)}
          {toolButton('sticker', '스티커', Smile)}
        </div>
      </div>
    </div>,
    document.body,
  )
}
