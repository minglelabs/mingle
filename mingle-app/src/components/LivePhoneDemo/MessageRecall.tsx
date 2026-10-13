'use client'

import { Undo2 } from 'lucide-react'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { buildClientApiPath } from '@/lib/api-contract'
import { fetchReactionJson } from '@/lib/message-reaction-request'
import { MESSAGE_RECALLED_EVENT, messageRecallCopy, type MessageRecalledEventDetail } from '@/lib/message-recall'

const Room = createContext<{ conversationId: string; endpoint: string } | null>(null)
const Message = createContext<{ id: string; locale: string } | null>(null)

export function MessageRecallProvider({ conversationId, enabled, children }: {
  conversationId?: string; enabled: boolean; children: ReactNode
}) {
  const value = useMemo(() => conversationId && enabled ? {
    conversationId,
    endpoint: buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/recall`),
  } : null, [conversationId, enabled])
  return <Room.Provider value={value}>{children}</Room.Provider>
}

/** `id` is set only for a delivered message the viewer sent; anything else offers no recall. */
export function MessageRecallScope({ id, locale, children }: { id?: string; locale: string; children: ReactNode }) {
  const value = useMemo(() => id ? { id, locale } : null, [id, locale])
  return <Message.Provider value={value}>{children}</Message.Provider>
}

// A second tap confirms: unsending removes the message for every member and cannot be undone.
export function MessageRecallMenuItem({ onDone }: { onDone: () => void }) {
  const room = useContext(Room)
  const message = useContext(Message)
  const [state, setState] = useState<'idle' | 'confirm' | 'pending' | 'error'>('idle')
  if (!room || !message) return null
  const copy = messageRecallCopy(message.locale)
  const recall = async () => {
    if (state === 'pending') return
    if (state !== 'confirm') { setState('confirm'); return }
    setState('pending')
    try {
      await fetchReactionJson<{ ok: boolean }>(room.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id }),
      })
      const detail: MessageRecalledEventDetail = { conversationId: room.conversationId, messageId: message.id }
      window.dispatchEvent(new CustomEvent(MESSAGE_RECALLED_EVENT, { detail }))
      onDone()
    } catch {
      setState('error')
    }
  }
  return <>
    <div className="h-px bg-gray-100" />
    <button type="button" data-message-recall-button disabled={state === 'pending'}
      onClick={event => { event.preventDefault(); event.stopPropagation(); void recall() }}
      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[14px] font-medium text-rose-600 transition hover:bg-rose-50 active:bg-rose-100 disabled:opacity-60">
      <span>{state === 'confirm' ? copy.confirm : state === 'pending' ? copy.pending : copy.recall}</span>
      <Undo2 className="h-4 w-4 shrink-0 text-rose-400" />
    </button>
    {state === 'error' && <p role="alert" className="px-4 pb-3 text-[12px] text-rose-600">{copy.error}</p>}
  </>
}
