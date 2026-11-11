'use client'

import { Gamepad2 } from 'lucide-react'
import { resolveHashRushMessageState, type HashRushMessage } from '@/lib/hash-rush-message'
import { hashRushInviteCopy } from '@/features/hash-rush/invite-copy'
import { useHashRushRoom } from './hash-rush-room-context'

/**
 * The message a Hash Rush game leaves when it starts: who started it, and a
 * Join button that works while that game runs. Turning the invite down does
 * not remove this, so it is also the way in later. Same card as a voice talk's.
 */
export default function HashRushStartedBubble(props: {
  message: HashRushMessage
  speakerName: string
  isOwnMessage: boolean
  locale: string
}) {
  const copy = hashRushInviteCopy(props.locale)
  const room = useHashRushRoom()
  const state = room
    ? resolveHashRushMessageState({ message: props.message, liveSessionId: room.liveSessionId, joined: room.joined })
    : 'ended'
  const name = props.speakerName.trim()
  const title = props.isOwnMessage ? copy.startedByMe : name ? copy.startedBy(name) : copy.startedBySomeone
  const live = state !== 'ended'

  return (
    <div
      data-hash-rush-message={props.message.sessionId}
      data-hash-rush-state={state}
      className={`w-[min(260px,100%)] rounded-2xl border px-3.5 py-3 shadow-sm ${
        live ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${
            live ? 'bg-emerald-500' : 'bg-gray-300'
          }`}
        >
          <Gamepad2 size={18} strokeWidth={2.3} />
        </span>
        <p className={`min-w-0 flex-1 text-[0.94rem] font-semibold leading-snug ${live ? 'text-gray-900' : 'text-gray-500'}`}>
          {title}
        </p>
      </div>
      {state === 'joinable' ? (
        <button
          type="button"
          data-qa="hash-rush-message-join"
          onClick={() => room?.join()}
          className="mt-2.5 flex h-11 w-full items-center justify-center rounded-xl bg-emerald-500 text-[0.92rem] font-semibold text-white active:bg-emerald-600"
        >
          {copy.join}
        </button>
      ) : (
        <p
          data-qa="hash-rush-message-status"
          className={`mt-2 text-center text-[0.8rem] font-medium ${state === 'joined' ? 'text-emerald-700' : 'text-gray-400'}`}
        >
          {state === 'joined' ? copy.joined : copy.ended}
        </p>
      )}
    </div>
  )
}
