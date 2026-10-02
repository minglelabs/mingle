'use client'

import { useEffect, useState } from 'react'
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
  const [mounted, setMounted] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setSession((current) => current + 1)
      setMounted(true)
    }
  }

  useEffect(() => {
    if (open) return
    const timer = window.setTimeout(() => setMounted(false), 360)
    return () => window.clearTimeout(timer)
  }, [open])

  return (
    <SlideSurface
      open={open}
      onClose={onClose}
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
        />
      ) : null}
    </SlideSurface>
  )
}
