'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import MessageReactionParticipants from './MessageReactionParticipants'
import { fetchReactionJson } from '@/lib/message-reaction-request'
import { buildClientApiPath } from '@/lib/api-contract'
import { MESSAGE_REACTIONS, MESSAGE_REACTIONS_REFRESH_EVENT, messageReactionCopy, type MessageReactionKind, type MessageReactionSummary } from '@/lib/message-reactions'

type RoomContext = {
  endpoint: string
  active: boolean
  register: (id: string) => () => void
  reactions: Record<string, MessageReactionSummary[]>
  pending: ReadonlySet<string>
  errors: ReadonlySet<string>
  select: (id: string, kind: MessageReactionKind) => Promise<void>
}
const Room = createContext<RoomContext | null>(null)
const Message = createContext<{ id: string; locale: string } | null>(null)

// Keyed at the room boundary: pending responses from a departed room cannot
// update another room, even when both contain the same client message ID.
export function MessageReactionsProvider({ conversationId, enabled, active = true, children }: {
  conversationId?: string; enabled: boolean; active?: boolean; children: ReactNode
}) {
  if (!conversationId) return <>{children}</>
  return <ReactionRoom key={conversationId} conversationId={conversationId} enabled={enabled} active={active}>{children}</ReactionRoom>
}
function ReactionRoom({ conversationId, enabled, active, children }: { conversationId: string; enabled: boolean; active: boolean; children: ReactNode }) {
  const ids = useRef(new Map<string, number>())
  const busy = useRef(new Set<string>())
  const generation = useRef(0)
  const refreshing = useRef(false)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const [reactions, setReactions] = useState<Record<string, MessageReactionSummary[]>>({})
  const current = useRef(reactions)
  current.current = reactions
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set())
  const endpoint = buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/reactions`)
  const refresh = useCallback(async () => {
    if (!enabled || !active || document.visibilityState === 'hidden' || busy.current.size || refreshing.current) return
    refreshing.current = true
    const version = ++generation.current
    const messageIds = [...ids.current.keys()]
    try {
      const result: Record<string, MessageReactionSummary[]> = {}
      for (let offset = 0; offset < messageIds.length; offset += 100) {
        const query = new URLSearchParams()
        messageIds.slice(offset, offset + 100).forEach(id => query.append('id', id))
        const payload = await fetchReactionJson<{ reactions: Record<string, MessageReactionSummary[]> }>(`${endpoint}?${query}`, { cache: 'no-store' })
        Object.assign(result, payload.reactions)
      }
      if (generation.current === version) setReactions(result)
    } catch { /* Preserve the last known counts while offline. */ }
    finally { refreshing.current = false }
  }, [endpoint, enabled, active])
  const scheduled = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedule = useCallback(() => {
    if (scheduled.current) clearTimeout(scheduled.current)
    scheduled.current = setTimeout(() => { scheduled.current = null; void refresh() }, 100)
  }, [refresh])
  const register = useCallback((id: string) => {
    ids.current.set(id, (ids.current.get(id) ?? 0) + 1)
    schedule()
    return () => {
      const count = (ids.current.get(id) ?? 1) - 1
      if (count) ids.current.set(id, count)
      else ids.current.delete(id)
    }
  }, [schedule])
  useEffect(() => {
    const onPush = (event: Event) => {
      if ((event as CustomEvent<string>).detail === conversationId) schedule()
    }
    const timer = setInterval(() => void refresh(), 5000)
    window.addEventListener(MESSAGE_REACTIONS_REFRESH_EVENT, onPush)
    window.addEventListener('online', schedule)
    document.addEventListener('visibilitychange', schedule)
    return () => {
      invalidate()
      clearInterval(timer)
      if (scheduled.current) clearTimeout(scheduled.current)
      window.removeEventListener(MESSAGE_REACTIONS_REFRESH_EVENT, onPush)
      window.removeEventListener('online', schedule)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [conversationId, refresh, schedule, invalidate])
  const select = useCallback(async (id: string, kind: MessageReactionKind) => {
    if (busy.current.has(id)) return
    busy.current.add(id)
    generation.current++
    setPending(new Set(busy.current))
    setErrors(value => { const next = new Set(value); next.delete(id); return next })
    const selected = current.current[id]?.some(row => row.kind === kind && row.mine)
    try {
      const payload = await fetchReactionJson<{ reactions: MessageReactionSummary[] }>(endpoint, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: id, kind: selected ? null : kind }),
      })
      setReactions(value => ({ ...value, [id]: payload.reactions }))
    } catch {
      setErrors(value => new Set(value).add(id))
    } finally {
      busy.current.delete(id)
      setPending(new Set(busy.current))
      schedule()
    }
  }, [endpoint, schedule])
  const value = useMemo(() => ({ register, reactions, pending, errors, select, endpoint, active }), [register, reactions, pending, errors, select, endpoint, active])
  return <Room.Provider value={enabled ? value : null}>{children}</Room.Provider>
}

export function MessageReactionScope({ id, locale, children }: { id?: string; locale: string; children: ReactNode }) {
  const register = useContext(Room)?.register
  useEffect(() => id && register ? register(id) : undefined, [id, register])
  const value = useMemo(() => id ? { id, locale } : null, [id, locale])
  return <Message.Provider value={value}>{children}</Message.Provider>
}
export function MessageReactionPicker({ onSelect }: { onSelect: () => void }) {
  const room = useContext(Room)
  const message = useContext(Message)
  if (!room || !message) return null
  const copy = messageReactionCopy(message.locale)
  return <div role="group" aria-label={copy.label} className="flex border-b border-slate-100 p-1">
    {MESSAGE_REACTIONS.map(({ kind, emoji }) => <button key={kind} type="button"
      aria-label={copy[kind]} aria-pressed={room.reactions[message.id]?.some(row => row.kind === kind && row.mine) ?? false}
      disabled={room.pending.has(message.id)}
      className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl hover:bg-slate-100 aria-pressed:bg-sky-100 disabled:opacity-50"
      onClick={event => { event.preventDefault(); event.stopPropagation(); onSelect(); void room.select(message.id, kind) }}
    >{emoji}</button>)}
  </div>
}
export function MessageReactionBadges() {
  const room = useContext(Room)
  const message = useContext(Message)
  if (!room || !message || !room.active) return null
  return <ReactionBadgesContent room={room} message={message} />
}
function ReactionBadgesContent({ room, message }: { room: RoomContext; message: { id: string; locale: string } }) {
  const [participants, setParticipants] = useState<MessageReactionKind | null>(null)
  const closeParticipants = useCallback(() => setParticipants(null), [])
  const copy = messageReactionCopy(message.locale)
  const rows = room.reactions[message.id] ?? []
  return <>
    {rows.length > 0 && <div role="group" aria-label={copy.label} className="flex max-w-full flex-wrap gap-1 pt-1">
      {rows.map(row => <ReactionBadge key={row.kind} row={row} locale={message.locale}
        pending={room.pending.has(message.id)} onSelect={() => void room.select(message.id, row.kind)}
        onShowParticipants={() => setParticipants(row.kind)} />)}
    </div>}
    {participants && room.active && <MessageReactionParticipants endpoint={room.endpoint} messageId={message.id}
      initialKind={participants} locale={message.locale} onClose={closeParticipants} />}
    {room.errors.has(message.id) && <p role="alert" className="max-w-64 pt-1 text-xs text-red-600">{copy.error}</p>}
  </>
}

function ReactionBadge({ row, locale, pending, onSelect, onShowParticipants }: {
  row: MessageReactionSummary; locale: string; pending: boolean; onSelect: () => void; onShowParticipants: () => void
}) {
  const copy = messageReactionCopy(locale)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const clearPress = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null; origin.current = null
  }, [])
  useEffect(() => clearPress, [clearPress])
  return <button type="button" aria-pressed={row.mine} aria-label={`${copy[row.kind]} ${row.count}, ${copy.hint}`} title={copy.hint} aria-disabled={pending}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return
      clearPress(); suppressClick.current = false
      origin.current = { x: event.clientX, y: event.clientY }
      timer.current = setTimeout(() => { clearPress(); suppressClick.current = true; onShowParticipants() }, 450)
    }}
    onPointerMove={event => {
      if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) {
        suppressClick.current = true; clearPress()
      }
    }}
    onPointerUp={clearPress} onPointerCancel={() => { suppressClick.current = true; clearPress() }} onPointerLeave={clearPress}
    onContextMenu={event => { event.preventDefault(); clearPress(); suppressClick.current = true; onShowParticipants() }}
    onKeyDown={event => {
      if (event.key === 'ContextMenu' || (event.shiftKey && (event.key === 'F10' || event.key === 'Enter'))) {
        event.preventDefault(); onShowParticipants()
      } else if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false
    }}
    onClick={event => {
      if (suppressClick.current) { event.preventDefault(); suppressClick.current = false; return }
      if (!pending) onSelect()
    }}
    className="min-h-8 min-w-11 select-none rounded-full border border-slate-200 bg-white px-2 text-sm aria-pressed:border-sky-400 aria-pressed:bg-sky-50 aria-disabled:opacity-50"
    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
  >{MESSAGE_REACTIONS.find(reaction => reaction.kind === row.kind)?.emoji} {row.count}</button>
}
