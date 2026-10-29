'use client'

import { buildClientApiPath } from '@/lib/api-contract'
import { getOrCreateTrackingUserId } from '@/components/LivePhoneDemo/realtime-storage'

/**
 * Temporary field diagnostics for two device-only bugs (2026-10-29): a room menu that stays on
 * screen after an iOS edge-swipe back, and screens where no tap registers. Each report is a
 * `ui_diagnostic` row in app_event_logs. Remove once both are understood.
 */
export function reportUiDiagnostic(kind: string, details: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return
  try {
    void fetch(buildClientApiPath('/log/client-event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mingle-user-id': getOrCreateTrackingUserId() },
      body: JSON.stringify({
        eventType: 'ui_diagnostic',
        metadata: {
          kind,
          ...details,
          pathname: window.location.pathname,
          search: window.location.search.slice(0, 200),
          visibility: document.visibilityState,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          atMs: Date.now(),
        },
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Diagnostics must never affect the app.
  }
}

const FULL_SCREEN_TAP_REPORT_INTERVAL_MS = 15_000

function isTransparent(color: string): boolean {
  return color === 'transparent' || /rgba\(.*,\s*0\)$/.test(color.replace(/\s+/g, ' ').trim())
}

/** What a tap landed on, when that is a transparent layer covering (almost) the whole screen. */
export function describeFullScreenTransparentTarget(target: Element, viewport: { width: number; height: number }): Record<string, unknown> | null {
  const rect = target.getBoundingClientRect()
  const covers = rect.width >= viewport.width * 0.9 && rect.height >= viewport.height * 0.9
  if (!covers) return null
  const style = window.getComputedStyle(target)
  if (!isTransparent(style.backgroundColor) || style.backgroundImage !== 'none') return null
  if ((target.textContent || '').trim().length > 0 && target.children.length > 0) return null
  return {
    tag: target.tagName.toLowerCase(),
    className: (target.getAttribute('class') || '').slice(0, 200),
    role: target.getAttribute('role'),
    ariaLabel: target.getAttribute('aria-label'),
    dataQa: target.getAttribute('data-qa'),
    zIndex: style.zIndex,
    position: style.position,
    parentClassName: (target.parentElement?.getAttribute('class') || '').slice(0, 200),
  }
}

/** Reports taps that land on an invisible full-screen layer, which would swallow them. */
export function installFullScreenTapDetector(): () => void {
  let lastReportAt = 0
  const handlePointerDown = (event: PointerEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const now = Date.now()
    if (now - lastReportAt < FULL_SCREEN_TAP_REPORT_INTERVAL_MS) return
    const described = describeFullScreenTransparentTarget(target, { width: window.innerWidth, height: window.innerHeight })
    if (!described) return
    lastReportAt = now
    reportUiDiagnostic('full_screen_transparent_tap', described)
  }
  document.addEventListener('pointerdown', handlePointerDown, true)
  return () => document.removeEventListener('pointerdown', handlePointerDown, true)
}
