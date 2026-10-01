'use client'
import { useCallback, useMemo, useState } from 'react'
import { type ConversationMessageImage } from '@/lib/conversation-image'
import { resolveConversationImageCopy } from '@/i18n/conversation-image-copy'
import ConversationImageViewer from './ConversationImageViewer'
import CopyableBubbleSurface from './CopyableBubbleSurface'
import { useConversationImageGallery } from './conversation-image-gallery-context'
import { conversationImagePath, conversationImageSrc, findConversationImageIndex } from './conversation-image-gallery.logic'

/**
 * A photo in the chat. Tapping it opens the full-screen viewer on the room's photos (when the chat
 * list provides them) so a swipe turns to the next one; elsewhere (share, spectate, legacy screens)
 * it opens that photo alone.
 */
export default function ConversationImageBubble({ image, locale }: { image: ConversationMessageImage; locale: string }) {
  const copy = resolveConversationImageCopy(locale)
  const gallery = useConversationImageGallery()
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  // The viewer's onClose must stay stable: the dialog moves focus whenever it changes.
  const close = useCallback(() => setExpanded(false), [])
  const images = useMemo(
    () => (gallery && findConversationImageIndex(gallery, image.messageId) >= 0 ? gallery : [image]),
    [gallery, image],
  )
  const path = conversationImagePath(image)
  const src = conversationImageSrc(image, retry)
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
    {expanded && <ConversationImageViewer images={images} initialMessageId={image.messageId} locale={locale} onClose={close} />}
  </>
}
