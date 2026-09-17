'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Image as Photo, Keyboard, Loader2, Plus, X } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { CONVERSATION_IMAGE_MAX_BYTES, conversationImageCopy } from '@/lib/conversation-image'
import { createPortal } from 'react-dom'
import MessageMediaDialog from './MessageMediaDialog'

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
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort() } }, [])
  useEffect(() => () => { if (chosen) URL.revokeObjectURL(chosen.url) }, [chosen])
  const close = useCallback(() => { if (!request.current) { setOpen(false); setChosen(null); setError(null) } }, [])
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
      onPointerDown={event => event.preventDefault()}
      onClick={event => { if (!onCloseKeyboard) { input.current?.click(); return }; const rect = event.currentTarget.getBoundingClientRect(); setAnchor({ right: Math.max(8, window.innerWidth - rect.right), bottom: window.innerHeight - rect.top + 8 }); setOpen(value => !value) }}
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
      <div role="group" aria-label={copy.attach} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }} className="fixed z-[100] min-w-44 rounded-2xl border border-gray-200 bg-white p-1.5 text-gray-700 shadow-lg" style={anchor}>
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
  </>
}
