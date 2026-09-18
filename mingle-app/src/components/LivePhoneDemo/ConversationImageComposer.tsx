'use client'
import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { Image as Photo, Keyboard, Loader2, Plus, X } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { CONVERSATION_IMAGE_MAX_BYTES, conversationImageCopy } from '@/lib/conversation-image'
import { createPortal } from 'react-dom'
import MessageMediaDialog from './MessageMediaDialog'

// ── Diagnostic constants ──────────────────────────────────────────────
const DIAG_LS_KEY = '__mingle_diag_v1__'
const DIAG_LONG_PRESS_MS = 2000
const DIAG_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours
const DIAG_MOVE_CANCEL_PX = 10
// ── End diagnostic constants ──────────────────────────────────────────

function isDiagActiveInitial(): boolean {
  try {
    if (typeof window === 'undefined') return false
    // 1. Fallback via URL query parameter (?diag=1)
    if (new URLSearchParams(window.location.search).has('diag')) return true
    // 2. Local storage with 24-hour expiration
    const raw = localStorage.getItem(DIAG_LS_KEY)
    if (!raw) return false
    const expiry = Number(raw)
    if (Number.isNaN(expiry) || Date.now() > expiry) {
      localStorage.removeItem(DIAG_LS_KEY)
      return false
    }
    return true
  } catch { return false }
}

export default function ConversationImageComposer({ conversationId, locale, onSent, onCloseKeyboard, voiceButtonSize = 33 }: {
  conversationId: string; locale: string; onSent: () => void; onCloseKeyboard?: () => void; voiceButtonSize?: number
}) {
  const copy = conversationImageCopy(locale)
  const [anchor, setAnchor] = useState({ right: 8, bottom: 48 })
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<{ file: File; url: string; id: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  // ── Diagnostic instrumentation ──────────────────────────────────────
  const [diagEnabled, setDiagEnabled] = useState(isDiagActiveInitial)
  const [diagLog, setDiagLog] = useState<string[]>([])
  const [diagFlash, setDiagFlash] = useState<string | null>(null)
  const diagT0Ref = useRef(0)
  const diagLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const diagSuppressClickRef = useRef(false)
  const diagTouchStartPosRef = useRef<{ x: number; y: number } | null>(null)

  const pushDiag = useCallback((tag: string) => {
    if (!diagT0Ref.current) diagT0Ref.current = Date.now()
    const elapsed = Date.now() - diagT0Ref.current
    setDiagLog(prev => [...prev.slice(-11), `${tag}:+${elapsed}ms`])
  }, [])

  // Expose global fallback toggle on window for WebKit remote console or native injection
  useEffect(() => {
    if (typeof window === 'undefined') return
    const g = window as unknown as { __mingle_toggle_diag__?: () => boolean }
    g.__mingle_toggle_diag__ = () => {
      setDiagEnabled(prev => {
        const next = !prev
        if (next) {
          try { localStorage.setItem(DIAG_LS_KEY, String(Date.now() + DIAG_EXPIRY_MS)) } catch { /* ignore */ }
        } else {
          try { localStorage.removeItem(DIAG_LS_KEY) } catch { /* ignore */ }
        }
        setDiagFlash(next ? 'DIAG ON' : 'DIAG OFF')
        setTimeout(() => setDiagFlash(null), 1500)
        return next
      })
      return true
    }
    return () => { delete g.__mingle_toggle_diag__ }
  }, [])

  // Track open state changes
  useEffect(() => {
    if (diagEnabled) pushDiag(open ? 'ST:open' : 'ST:closed')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire on open change when diag is on
  }, [open, diagEnabled])

  // Long-press handlers
  const cancelLongPress = useCallback(() => {
    if (diagLongPressTimerRef.current) {
      clearTimeout(diagLongPressTimerRef.current)
      diagLongPressTimerRef.current = null
    }
    diagTouchStartPosRef.current = null
  }, [])

  const handleLongPressStart = useCallback((event?: ReactTouchEvent<HTMLButtonElement>) => {
    if (!onCloseKeyboard) return // voice mode — no diag activation
    if (event?.touches?.[0]) {
      diagTouchStartPosRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    }
    diagLongPressTimerRef.current = setTimeout(() => {
      diagLongPressTimerRef.current = null
      diagSuppressClickRef.current = true // prevent subsequent click from opening menu
      diagTouchStartPosRef.current = null
      const next = !diagEnabled
      setDiagEnabled(next)
      setDiagLog([])
      diagT0Ref.current = 0
      setDiagFlash(next ? 'DIAG ON' : 'DIAG OFF')
      setTimeout(() => setDiagFlash(null), 1500)
      try {
        if (next) {
          localStorage.setItem(DIAG_LS_KEY, String(Date.now() + DIAG_EXPIRY_MS))
        } else {
          localStorage.removeItem(DIAG_LS_KEY)
        }
      } catch { /* ignore */ }
    }, DIAG_LONG_PRESS_MS)
  }, [onCloseKeyboard, diagEnabled])

  const handleTouchMove = useCallback((event: ReactTouchEvent<HTMLButtonElement>) => {
    if (!diagLongPressTimerRef.current || !diagTouchStartPosRef.current || !event.touches[0]) return
    const touch = event.touches[0]
    const dx = Math.abs(touch.clientX - diagTouchStartPosRef.current.x)
    const dy = Math.abs(touch.clientY - diagTouchStartPosRef.current.y)
    if (dx > DIAG_MOVE_CANCEL_PX || dy > DIAG_MOVE_CANCEL_PX) {
      cancelLongPress()
    }
  }, [cancelLongPress])

  // Clean up long-press timer on unmount
  useEffect(() => () => { cancelLongPress() }, [cancelLongPress])

  // Log the rendered menu's position — measured at 3 key intervals (immediate, rAF, 250ms)
  const diagMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!diagEnabled || !open || chosen || !diagMenuRef.current) return
    const node = diagMenuRef.current

    // MR1: immediate mount
    const r1 = node.getBoundingClientRect()
    pushDiag(`MR1:${Math.round(r1.top)},${Math.round(r1.bottom)},${Math.round(r1.left)},${Math.round(r1.right)}`)

    // MR2: next animation frame
    const frameId = requestAnimationFrame(() => {
      if (!node.isConnected) return
      const r2 = node.getBoundingClientRect()
      pushDiag(`MR2:${Math.round(r2.top)},${Math.round(r2.bottom)},${Math.round(r2.left)},${Math.round(r2.right)}`)
    })

    // MR3: settled after keyboard transition (~250ms)
    const settleTimerId = setTimeout(() => {
      if (!node.isConnected) return
      const r3 = node.getBoundingClientRect()
      pushDiag(`MR3:${Math.round(r3.top)},${Math.round(r3.bottom)},${Math.round(r3.left)},${Math.round(r3.right)}`)
    }, 250)

    return () => {
      cancelAnimationFrame(frameId)
      clearTimeout(settleTimerId)
    }
  }, [open, chosen, diagEnabled, pushDiag])
  // ── End diagnostic hooks ────────────────────────────────────────────

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current?.abort()
    }
  }, [])
  useEffect(() => () => { if (chosen) URL.revokeObjectURL(chosen.url) }, [chosen])
  const close = useCallback(() => { if (!request.current) { setOpen(false); setChosen(null); setError(null) } }, [])
  const openAttachmentMenu = useCallback((trigger: HTMLButtonElement) => {
    const rect = trigger.getBoundingClientRect()
    const vp = window.visualViewport

    if (diagEnabled) {
      pushDiag(`R:${Math.round(rect.top)},${Math.round(rect.bottom)},${Math.round(rect.left)},${Math.round(rect.right)}`)
      pushDiag(`IH:${window.innerHeight} VH:${Math.round(vp?.height ?? 0)} VO:${Math.round(vp?.offsetTop ?? 0)}`)
    }

    setAnchor({ right: Math.max(8, window.innerWidth - rect.right), bottom: window.innerHeight - rect.top + 8 })
    setOpen(true)
  }, [diagEnabled, pushDiag])
  const handleAttachmentClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    // If a long-press just toggled diag mode, suppress the trailing click.
    if (diagSuppressClickRef.current) {
      diagSuppressClickRef.current = false
      if (diagEnabled) pushDiag('SUPPRESS_CLICK')
      return
    }

    if (!onCloseKeyboard) {
      input.current?.click()
      return
    }

    // Let WKWebView complete the ordinary button click. Preventing pointer-down
    // can suppress that click while the software keyboard is visible.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    openAttachmentMenu(event.currentTarget)
  }, [onCloseKeyboard, openAttachmentMenu, diagEnabled, pushDiag])

  // ── Diagnostic touch/pointer event handlers ─────────────────────────
  const handleDiagTouchStart = useCallback(() => { pushDiag('TS') }, [pushDiag])
  const handleDiagTouchEnd = useCallback(() => { pushDiag('TE') }, [pushDiag])
  const handleDiagTouchCancel = useCallback(() => { pushDiag('TC') }, [pushDiag])
  const handleDiagPointerDown = useCallback(() => { pushDiag('PD') }, [pushDiag])
  const handleDiagPointerUp = useCallback(() => { pushDiag('PU') }, [pushDiag])
  const handleDiagPointerCancel = useCallback(() => { pushDiag('PC') }, [pushDiag])
  const handleDiagClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (!diagSuppressClickRef.current) pushDiag('CK')
    handleAttachmentClick(event)
  }, [pushDiag, handleAttachmentClick])
  // ── End diagnostic event handlers ───────────────────────────────────

  const send = async () => {
    if (!chosen || request.current) return
    const controller = new AbortController(); request.current = controller
    const deadline = setTimeout(() => controller.abort(), 45_000)
    setPending(true); setError(null)
    try {
      const body = new FormData(); body.set('file', chosen.file); body.set('clientMessageId', chosen.id)
      const response = await fetch(buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/images`), { method: 'POST', body, signal: controller.signal })
      if (!response.ok) throw new Error('image_send_failed')
      await response.json()
      if (mounted.current) { setChosen(null); setOpen(false); onSent() }
    } catch { if (mounted.current) setError(copy.error) }
    finally { clearTimeout(deadline); request.current = null; if (mounted.current) setPending(false) }
  }
  return <>
    <button type="button" data-qa="live-demo-attachment-open" aria-label={onCloseKeyboard ? copy.attach : copy.choose}
      aria-expanded={onCloseKeyboard ? open : undefined}
      onTouchStart={e => { handleLongPressStart(e); if (diagEnabled) handleDiagTouchStart() }}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => { cancelLongPress(); if (diagEnabled) handleDiagTouchEnd() }}
      onTouchCancel={() => { cancelLongPress(); if (diagEnabled) handleDiagTouchCancel() }}
      onPointerDown={diagEnabled ? handleDiagPointerDown : undefined}
      onPointerUp={diagEnabled ? handleDiagPointerUp : undefined}
      onPointerCancel={() => { cancelLongPress(); if (diagEnabled) handleDiagPointerCancel() }}
      onClick={diagEnabled ? handleDiagClick : handleAttachmentClick}
      style={onCloseKeyboard ? undefined : { width: voiceButtonSize, height: voiceButtonSize }}
      className="inline-flex h-[33px] w-[33px] shrink-0 items-center justify-center text-gray-500 transition-all duration-200 hover:text-gray-700 active:scale-95">{onCloseKeyboard ? <Plus size={20} /> : <Photo size={18} strokeWidth={2.15} />}</button>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label={copy.choose} className="hidden"
      onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''
        if (!file) return
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > CONVERSATION_IMAGE_MAX_BYTES || !file.size) { setError(copy.invalid); setOpen(true); return }
        setOpen(true); setChosen({ file, url: URL.createObjectURL(file), id: `image-${crypto.randomUUID()}` }); setError(null)
      }} />
    {open && !chosen && createPortal(<>
      <div className="fixed inset-0 z-[99]" onPointerDown={() => setOpen(false)} />
      <div ref={diagMenuRef} role="group" aria-label={copy.attach} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }} className="fixed z-[100] min-w-44 rounded-2xl border border-gray-200 bg-white p-1.5 text-gray-700 shadow-lg" style={anchor}>
        <button type="button" onClick={() => input.current?.click()} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-slate-50"><Photo size={20} strokeWidth={2.15} />{copy.choose}</button>
        {onCloseKeyboard && <button type="button" onClick={() => { close(); onCloseKeyboard() }} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-slate-50"><Keyboard size={20} />{copy.closeKeyboard}</button>}
        {error && <p role="alert" className="max-w-60 px-3 text-sm text-red-600">{error}</p>}
      </div>
    </>, document.body)}
    {open && chosen && <MessageMediaDialog title={chosen ? copy.preview : copy.attach} onClose={close}>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{chosen ? copy.preview : copy.attach}</h2><button type="button" disabled={pending} aria-label={copy.close} onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"><X size={20} /></button></div>
      <>
        {/* Local file URLs are intentionally displayed without the Next image proxy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={chosen.url} alt={copy.preview} className="max-h-[50dvh] w-full rounded-xl object-contain" />
        <button type="button" disabled={pending} onClick={() => void send()} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 font-medium text-white disabled:opacity-60">{pending && <Loader2 size={18} className="animate-spin" />}{pending ? copy.sending : copy.send}</button>
      </>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </MessageMediaDialog>}
    {/* Diagnostic overlay — activated by long-pressing the + button for 2 s or ?diag=1 */}
    {diagEnabled && diagLog.length > 0 && createPortal(
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,0.85)', color: '#0f0',
        fontSize: '10px', fontFamily: 'monospace', lineHeight: '1.4',
        padding: '6px 10px', zIndex: 9999,
        pointerEvents: 'none', wordBreak: 'break-all',
      }}>
        {diagLog.map((entry, i) => <span key={i}>{i > 0 ? ' | ' : ''}{entry}</span>)}
      </div>,
      document.body
    )}
    {/* Diagnostic activation/deactivation flash */}
    {diagFlash && createPortal(
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'rgba(0,0,0,0.85)', color: '#fff',
        fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace',
        padding: '16px 32px', borderRadius: '12px', zIndex: 9999,
        pointerEvents: 'none',
      }}>
        {diagFlash}
      </div>,
      document.body
    )}
  </>
}
