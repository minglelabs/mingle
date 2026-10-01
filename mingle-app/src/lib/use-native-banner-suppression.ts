'use client'

import { useEffect } from 'react'
import { suppressNativeBanner } from '@/lib/native-banner-zone'

/**
 * Keeps the native AdMob banner hidden while `active` is true. Use it in any
 * overlay, modal, sheet or full-screen viewer layered over the conversation
 * list or a chat room — the native banner draws above the WebView, so web
 * overlays cannot cover it on their own.
 */
export function useNativeBannerSuppression(active = true): void {
  useEffect(() => {
    if (!active) return
    return suppressNativeBanner()
  }, [active])
}
