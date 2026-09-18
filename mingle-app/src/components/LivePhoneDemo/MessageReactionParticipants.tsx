'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { registerNativeBackHandler } from '@/lib/native-back-handler'
import { fetchReactionJson } from '@/lib/message-reaction-request'
import { MESSAGE_REACTIONS, messageReactionCopy, type MessageReactionKind, type MessageReactionParticipant, type MessageReactionParticipantsPage } from '@/lib/message-reactions'

export default function MessageReactionParticipants({ endpoint, messageId, initialKind, locale, onClose }: {
  endpoint: string; messageId: string; initialKind: MessageReactionKind; locale: string; onClose: () => void
}) {
  const [kind, setKind] = useState(initialKind)
  const copy = messageReactionCopy(locale)
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButton.current?.focus({ preventScroll: true })
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return }
      if (event.key !== 'Tab') return
      const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      const first = buttons[0], last = buttons.at(-1)
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) {
        event.preventDefault(); first?.focus()
      }
    }
    document.addEventListener('keydown', handleKey, true)
    const unregister = registerNativeBackHandler(() => { onClose(); return true }, 40)
    return () => {
      document.removeEventListener('keydown', handleKey, true)
      unregister()
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/30 sm:items-center"
      onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={copy.participants}
        className="flex max-h-[75dvh] w-full max-w-sm flex-col rounded-t-3xl bg-white text-slate-900 shadow-xl sm:rounded-3xl"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between px-5 pt-3">
          <h2 className="text-base font-semibold">{copy.participants}</h2>
          <button ref={closeButton} type="button" aria-label={copy.close} onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div role="group" aria-label={copy.label} className="flex justify-around border-b border-slate-100 px-3 pb-2">
          {MESSAGE_REACTIONS.map(reaction => <button key={reaction.kind} type="button" aria-label={copy[reaction.kind]}
            aria-pressed={kind === reaction.kind} onClick={() => setKind(reaction.kind)}
            className="h-11 w-12 rounded-xl text-2xl hover:bg-slate-100 aria-pressed:bg-sky-100">{reaction.emoji}</button>)}
        </div>
        <ParticipantList key={kind} endpoint={endpoint} messageId={messageId} kind={kind} locale={locale} />
      </div>
    </div>, document.body,
  )
}
function ParticipantList({ endpoint, messageId, kind, locale }: { endpoint: string; messageId: string; kind: MessageReactionKind; locale: string }) {
  const copy = messageReactionCopy(locale)
  const [people, setPeople] = useState<MessageReactionParticipant[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const load = useCallback(async (after?: string) => {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setPending(true); setError(false)
    const query = new URLSearchParams({ id: messageId, kind, ...(after ? { after } : {}) })
    try {
      const page = await fetchReactionJson<MessageReactionParticipantsPage>(`${endpoint}?${query}`, { cache: 'no-store', signal: request.signal })
      if (!mounted.current || request.signal.aborted) return
      setPeople(previous => after ? [...new Map([...previous, ...page.participants].map(person => [person.id, person])).values()] : page.participants)
      setNextCursor(page.nextCursor)
    } catch {
      if (mounted.current && !request.signal.aborted) setError(true)
    } finally {
      if (mounted.current && controller.current === request) setPending(false)
    }
  }, [endpoint, messageId, kind])
  useEffect(() => {
    mounted.current = true
    void load()
    return () => { mounted.current = false; controller.current?.abort() }
  }, [load])
  return <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-3">
    <ul className="space-y-3">
      {people.map(person => <li key={person.id} className="flex min-h-11 items-center gap-3">
        <div aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold">{(person.name || person.handle).slice(0, 1)}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{person.name || person.handle}{person.mine ? ` · ${copy.me}` : ''}</p><p className="truncate text-xs text-slate-500">@{person.handle}</p></div>
      </li>)}
    </ul>
    {pending && <p role="status" className="py-4 text-center text-sm text-slate-500">{copy.loading}</p>}
    {error && <div className="py-3 text-center"><p role="alert" className="text-sm text-red-600">{copy.loadError}</p><button type="button" onClick={() => void load(nextCursor ?? undefined)} className="min-h-11 px-4 text-sm text-sky-700">{copy.retry}</button></div>}
    {!pending && !error && !people.length && <p className="py-6 text-center text-sm text-slate-500">{copy.empty}</p>}
    {!pending && !error && nextCursor && <button type="button" onClick={() => void load(nextCursor)} className="mt-2 min-h-11 w-full rounded-xl bg-slate-50 text-sm">{copy.more}</button>}
  </div>
}
