'use client'

import { CornerUpLeft, X } from 'lucide-react'
import { createContext, useContext, type ReactNode } from 'react'
import {
  resolveMessageReplyCopy,
  resolveMessageReplyPreviewText,
  type MessageReplyReference,
} from '@/lib/message-reply'

type RoomContext = {
  locale: string
  viewerUserId: string | null
  displayLanguages: readonly (string | null | undefined)[]
  // Ids of loaded messages that were unsent; their quotes drop the text.
  recalledIds: ReadonlySet<string>
  onReply: (reference: MessageReplyReference) => void
  onJumpTo: (id: string) => void
}
const Room = createContext<RoomContext | null>(null)
const Message = createContext<MessageReplyReference | null>(null)

export function MessageReplyProvider({ value, children }: { value: RoomContext | null; children: ReactNode }) {
  return <Room.Provider value={value}>{children}</Room.Provider>
}

/** `reference` is set only for a delivered message that can be replied to. */
export function MessageReplyScope({ reference, children }: { reference: MessageReplyReference | null; children: ReactNode }) {
  return <Message.Provider value={reference}>{children}</Message.Provider>
}

function resolveSpeakerLabel(reference: MessageReplyReference, room: RoomContext): string {
  const copy = resolveMessageReplyCopy(room.locale)
  if (reference.speakerUserId && reference.speakerUserId === room.viewerUserId) return copy.you
  return reference.speakerName || ''
}

function resolveQuoteText(reference: MessageReplyReference, room: RoomContext): string {
  const copy = resolveMessageReplyCopy(room.locale)
  if (reference.recalled || room.recalledIds.has(reference.id)) return copy.deleted
  return resolveMessageReplyPreviewText(reference, room.displayLanguages) || (reference.image ? copy.photo : '')
}

export function MessageReplyMenuItem({ onDone }: { onDone: () => void }) {
  const room = useContext(Room)
  const reference = useContext(Message)
  if (!room || !reference) return null
  const copy = resolveMessageReplyCopy(room.locale)
  return <>
    <div className="h-px bg-gray-100" />
    <button type="button" data-message-reply-button
      onClick={event => { event.preventDefault(); event.stopPropagation(); onDone(); room.onReply(reference) }}
      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[14px] font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100">
      <span>{copy.reply}</span>
      <CornerUpLeft className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  </>
}

// Quote shown above a reply's bubble; tapping it jumps to the original.
export function MessageReplyQuote({ reference, align }: { reference: MessageReplyReference; align: 'left' | 'right' }) {
  const room = useContext(Room)
  if (!room) return null
  const copy = resolveMessageReplyCopy(room.locale)
  const text = resolveQuoteText(reference, room)
  const speaker = resolveSpeakerLabel(reference, room)
  return (
    <button
      type="button"
      data-message-reply-quote
      aria-label={copy.jumpToOriginal}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); room.onJumpTo(reference.id) }}
      className={`mb-0.5 flex max-w-[16rem] min-w-0 flex-col rounded-xl border-l-[3px] border-amber-400 bg-black/[0.04] px-2.5 py-1 text-left ${align === 'right' ? 'self-end' : 'self-start'}`}
    >
      {speaker && <span className="truncate text-[11px] font-semibold leading-4 text-gray-600">{speaker}</span>}
      <span className="line-clamp-2 break-words text-[12px] leading-4 text-gray-500">{text}</span>
    </button>
  )
}

// "Replying to …" strip above the composer while a reply target is set.
export function MessageReplyComposerBar({ reference, onCancel }: { reference: MessageReplyReference; onCancel: () => void }) {
  const room = useContext(Room)
  if (!room) return null
  const copy = resolveMessageReplyCopy(room.locale)
  const speaker = resolveSpeakerLabel(reference, room)
  return (
    <div data-qa="live-demo-reply-bar" className="mb-1.5 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-1.5">
      <CornerUpLeft className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
      <button type="button" onClick={() => room.onJumpTo(reference.id)} className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-[12px] font-semibold leading-4 text-gray-700">
          {speaker ? copy.replyingTo.replace('{name}', speaker) : copy.reply}
        </span>
        <span className="truncate text-[12px] leading-4 text-gray-500">{resolveQuoteText(reference, room)}</span>
      </button>
      <button type="button" aria-label={copy.cancelReply} onClick={onCancel}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
