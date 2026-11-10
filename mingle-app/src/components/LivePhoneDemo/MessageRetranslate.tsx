'use client'

import { Languages } from 'lucide-react'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { buildClientApiPath } from '@/lib/api-contract'
import {
  MESSAGE_RETRANSLATED_EVENT,
  messageRetranslateCopy,
  type MessageRetranslatedEventDetail,
} from '@/lib/message-retranslate'

const RETRANSLATE_REQUEST_TIMEOUT_MS = 30_000

const Room = createContext<{ conversationId: string; endpoint: string } | null>(null)
const Message = createContext<{ id: string; locale: string } | null>(null)

export function MessageRetranslateProvider({ conversationId, enabled, children }: {
  conversationId?: string; enabled: boolean; children: ReactNode
}) {
  const value = useMemo(() => conversationId && enabled ? {
    conversationId,
    endpoint: buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/retranslate`),
  } : null, [conversationId, enabled])
  return <Room.Provider value={value}>{children}</Room.Provider>
}

/** `id` is set only for a delivered text message; anything else offers no retranslation. */
export function MessageRetranslateScope({ id, locale, children }: { id?: string; locale: string; children: ReactNode }) {
  const value = useMemo(() => id ? { id, locale } : null, [id, locale])
  return <Message.Provider value={value}>{children}</Message.Provider>
}

async function postRetranslation(endpoint: string, body: Record<string, string>): Promise<{ text?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RETRANSLATE_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`retranslate_request_${response.status}`)
    return await response.json() as { text?: string }
  } finally {
    clearTimeout(timer)
  }
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// `language` is the translation row the menu was opened on; the original row gets none.
export function MessageRetranslateMenuItem({ language, onDone }: { language?: string; onDone: () => void }) {
  const room = useContext(Room)
  const message = useContext(Message)
  const [state, setState] = useState<'idle' | 'pending' | 'error' | 'no-coins'>('idle')
  if (!room || !message || !language) return null
  const copy = messageRetranslateCopy(message.locale)
  const retranslate = async () => {
    if (state === 'pending') return
    setState('pending')
    try {
      const result = await postRetranslation(room.endpoint, {
        messageId: message.id,
        language,
        requestId: newRequestId(),
      })
      const text = typeof result.text === 'string' ? result.text.trim() : ''
      if (text) {
        const detail: MessageRetranslatedEventDetail = {
          conversationId: room.conversationId, messageId: message.id, language, text,
        }
        window.dispatchEvent(new CustomEvent(MESSAGE_RETRANSLATED_EVENT, { detail }))
      }
      onDone()
    } catch (error) {
      setState(error instanceof Error && error.message === 'retranslate_request_402' ? 'no-coins' : 'error')
    }
  }
  return <>
    <div className="h-px bg-gray-100" />
    <button type="button" data-message-retranslate-button disabled={state === 'pending'}
      onClick={event => { event.preventDefault(); event.stopPropagation(); void retranslate() }}
      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[14px] font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60">
      <span>{state === 'pending' ? copy.pending : copy.retranslate}</span>
      <Languages className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
    {(state === 'error' || state === 'no-coins') && (
      <p role="alert" className="px-4 pb-3 text-[12px] text-rose-600">{state === 'no-coins' ? copy.noCoins : copy.error}</p>
    )}
  </>
}
