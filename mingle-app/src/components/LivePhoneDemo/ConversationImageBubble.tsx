'use client'
import { useCallback, useState } from 'react'
import { X } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { conversationImageCopy, type ConversationMessageImage } from '@/lib/conversation-image'
import CopyableBubbleSurface from './CopyableBubbleSurface'
import MessageMediaDialog from './MessageMediaDialog'

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
      <button type="button" aria-label={copy.close} onClick={close} className="mb-2 flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-full bg-white/15"><X size={22} /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={copy.image} className="max-h-[75dvh] w-full object-contain" onError={() => { setFailed(true); setExpanded(false) }} />
    </MessageMediaDialog>}
  </>
}
