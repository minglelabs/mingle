'use client'

import { useEffect, useRef, useState } from 'react'
import SlideSurface from '@/components/slide-surface'
import { composeCopy } from '@/i18n/compose-copy'
import ComposeScreen from './compose-screen'

type ComposeOverlayProps = {
  open: boolean
  locale: string
  onClose: () => void
  /** After a publish starts. Defaults to ComposeScreen's own (go to the feed). */
  onPublished?: () => void
}

/**
 * The compose screen as a panel that slides in over the current tab (feed,
 * conversation list, my page) — the same surface and motion as the
 * notification panel — instead of a route change. Each open starts a fresh
 * editor; the editor stays mounted through the slide-out, then unmounts
 * (its unmount flushes the draft autosave).
 */
export default function ComposeOverlay({ open, locale, onClose, onPublished }: ComposeOverlayProps) {
  const [prevOpen, setPrevOpen] = useState(open)
  const [session, setSession] = useState(open ? 1 : 0)
  // The last session whose slide-out finished; its editor is gone.
  const [retiredSession, setRetiredSession] = useState(0)
  // Back / edge swipe closes the editor's inner layer (preview, drafts) first.
  const backHandlerRef = useRef<(() => boolean) | null>(null)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setSession((current) => current + 1)
  }

  // An open panel always has its editor: this must not depend on a state
  // update landing, or the panel slides in blank.
  const mounted = open || retiredSession !== session

  useEffect(() => {
    if (open) return
    const timer = window.setTimeout(() => setRetiredSession(session), 360)
    return () => window.clearTimeout(timer)
  }, [open, session])

  // Safety net: the app shell never scrolls sideways. If anything (a focus,
  // the keyboard) nudged the document horizontally while the panel was
  // around, put it back so the tab behind is not left shifted.
  useEffect(() => {
    const unshift = () => {
      if (window.scrollX !== 0) window.scrollTo(0, window.scrollY)
      if (document.documentElement.scrollLeft !== 0) document.documentElement.scrollLeft = 0
      if (document.body.scrollLeft !== 0) document.body.scrollLeft = 0
    }
    unshift()
    window.addEventListener('scroll', unshift, { passive: true })
    const timers = [120, 400, 800].map((ms) => window.setTimeout(unshift, ms))
    return () => {
      window.removeEventListener('scroll', unshift)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [open])

  return (
    <SlideSurface
      open={open}
      onClose={onClose}
      onRequestClose={() => !(backHandlerRef.current?.() ?? false)}
      ariaLabel={composeCopy(locale).entryTitle}
      className="fixed inset-0 z-[100] flex min-h-0 w-full flex-col overflow-hidden bg-card text-card-foreground shadow-2xl"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {mounted ? (
        <ComposeScreen
          key={session}
          locale={locale}
          initialDraftId={null}
          onClose={onClose}
          onPublished={onPublished}
          backHandlerRef={backHandlerRef}
        />
      ) : null}
    </SlideSurface>
  )
}
