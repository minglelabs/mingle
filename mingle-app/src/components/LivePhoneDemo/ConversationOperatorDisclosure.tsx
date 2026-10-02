'use client'

import { useState, type CSSProperties } from 'react'
import { ChevronDown, UsersRound } from 'lucide-react'
import { accountBadgeCopy } from '@/i18n/account-badge-copy'

type ConversationOperatorDisclosureProps = {
  locale: string
  /**
   * Distance from the top of the scroll container where the notice sticks —
   * e.g. the native top ad banner inset in the app's room view.
   */
  stickyTopPx?: number
  className?: string
}

/**
 * Pinned notice for a chat room with a Mingle-run (operator) member:
 * `chatDisclosure` from account-badge-copy, rendered from the hydration's
 * `operatorDisclosure`. It sticks to the top of the room timeline and can
 * never be dismissed; tapping only collapses it to one line (and back). The
 * collapsed state is not persisted, so every visit opens it in full.
 * Place it as the first child of the timeline's scroll container.
 */
export default function ConversationOperatorDisclosure({
  locale,
  stickyTopPx = 0,
  className = '',
}: ConversationOperatorDisclosureProps) {
  const copy = accountBadgeCopy(locale)
  const [collapsed, setCollapsed] = useState(false)
  const style: CSSProperties = { top: stickyTopPx }

  return (
    <div
      role="note"
      data-operator-disclosure
      data-operator-disclosure-collapsed={collapsed ? 'true' : 'false'}
      // z-[15]: above the empty-state layer (z-10) and message rows, below
      // the scroll thumb/date label (z-20) that briefly overlays the top.
      className={`sticky z-[15] ${className}`}
      style={style}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
        className="flex min-h-11 w-full touch-manipulation items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-left text-[0.8rem] leading-snug text-sky-900 shadow-sm transition-colors active:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        <UsersRound size={16} strokeWidth={2.2} className="mt-px shrink-0 text-sky-600" aria-hidden="true" />
        <span
          data-operator-disclosure-text
          className={`min-w-0 flex-1 ${collapsed ? 'truncate' : 'break-words'}`}
        >
          {copy.chatDisclosure}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2.2}
          className={`mt-px shrink-0 text-sky-500 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
