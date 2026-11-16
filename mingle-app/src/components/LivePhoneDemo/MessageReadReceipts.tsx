'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildClientApiPath } from '@/lib/api-contract'
import {
  MESSAGE_READ_RECEIPTS_REFRESH_EVENT,
  countMessageUnreadMembers,
  resolveMessageReadReceiptCopy,
  type MessageReadReceiptMember,
} from '@/lib/message-read-receipts'

type RoomContext = { members: MessageReadReceiptMember[]; viewerUserId: string | null }
const Room = createContext<RoomContext | null>(null)

// Only shared rooms show receipts; keyed per room so a late response from a
// departed room never lands in another one.
export function MessageReadReceiptsProvider({ conversationId, enabled, active = true, viewerUserId, children }: {
  conversationId?: string; enabled: boolean; active?: boolean; viewerUserId: string | null; children: ReactNode
}) {
  if (!conversationId || !enabled) return <>{children}</>
  return <ReadReceiptRoom key={conversationId} conversationId={conversationId} active={active} viewerUserId={viewerUserId}>{children}</ReadReceiptRoom>
}

function ReadReceiptRoom({ conversationId, active, viewerUserId, children }: {
  conversationId: string; active: boolean; viewerUserId: string | null; children: ReactNode
}) {
  const [members, setMembers] = useState<MessageReadReceiptMember[] | null>(null)
  const generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const endpoint = buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/read-receipts`)
  const refresh = useCallback(async () => {
    if (!active || document.visibilityState === 'hidden') return
    const version = ++generation.current
    try {
      const response = await fetch(endpoint, { cache: 'no-store' })
      if (!response.ok) return
      const payload = await response.json() as { members?: MessageReadReceiptMember[] }
      if (generation.current === version && Array.isArray(payload.members)) setMembers(payload.members)
    } catch { /* Keep the last known counts while offline. */ }
  }, [endpoint, active])
  const scheduled = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedule = useCallback(() => {
    if (scheduled.current) clearTimeout(scheduled.current)
    scheduled.current = setTimeout(() => { scheduled.current = null; void refresh() }, 150)
  }, [refresh])
  useEffect(() => {
    schedule()
    const onPush = (event: Event) => {
      if ((event as CustomEvent<string>).detail === conversationId) schedule()
    }
    // Push is the primary signal; the slow poll only covers a dropped socket.
    const timer = setInterval(() => void refresh(), 15000)
    window.addEventListener(MESSAGE_READ_RECEIPTS_REFRESH_EVENT, onPush)
    window.addEventListener('online', schedule)
    document.addEventListener('visibilitychange', schedule)
    return () => {
      invalidate()
      clearInterval(timer)
      if (scheduled.current) clearTimeout(scheduled.current)
      window.removeEventListener(MESSAGE_READ_RECEIPTS_REFRESH_EVENT, onPush)
      window.removeEventListener('online', schedule)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [conversationId, refresh, schedule, invalidate])
  const value = useMemo(() => members ? { members, viewerUserId } : null, [members, viewerUserId])
  return <Room.Provider value={value}>{children}</Room.Provider>
}

// Next to the bubble's "5m ago", in the same size: the number of members who
// haven't read the message yet, or a check once everyone has.
export function MessageReadReceipt({ senderUserId, createdAtMs, locale, className }: {
  senderUserId?: string | null; createdAtMs?: number; locale: string; className?: string
}) {
  const room = useContext(Room)
  if (!room || !senderUserId || typeof createdAtMs !== 'number' || !Number.isFinite(createdAtMs)) return null
  const unread = countMessageUnreadMembers({ members: room.members, senderUserId, createdAtMs, viewerUserId: room.viewerUserId })
  const copy = resolveMessageReadReceiptCopy(locale)
  return (
    <span
      data-chat-bubble-read-receipt
      role="img"
      aria-label={unread > 0 ? copy.unreadLabel.replace('{count}', String(unread)) : copy.read}
      className={`inline-flex shrink-0 items-center whitespace-nowrap text-[10px] font-medium leading-none tabular-nums ${unread > 0 ? 'text-amber-500' : 'text-black/[0.34]'}${className ? ` ${className}` : ''}`}
    >
      {unread > 0 ? unread : (
        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.2 6.4 4.8 9 9.8 3.2" />
        </svg>
      )}
    </span>
  )
}
