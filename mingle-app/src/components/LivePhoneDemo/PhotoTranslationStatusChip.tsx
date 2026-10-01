'use client'

import { Loader2 } from 'lucide-react'

/**
 * The pill's stand-in while the photo's text is still being read: there is nothing to translate
 * yet, so there is no pill, but the viewer should say that work is going on. Same glass look
 * and size as the pill; not interactive.
 */
export default function PhotoTranslationStatusChip({ label }: { label: string }) {
  return <div role="status" data-photo-translation-status
    className="pointer-events-none flex h-11 max-w-[min(18rem,calc(100vw-3rem))] select-none items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white"
    style={{ backgroundColor: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
    <Loader2 size={15} className="shrink-0 animate-spin" aria-hidden="true" />
    <span className="min-w-0 truncate">{label}</span>
  </div>
}
