'use client'

import { Phone, PhoneOff } from 'lucide-react'
import { resolveVoiceCallMessageState, type VoiceCallMessage } from '@/lib/voice-call-message'
import { useVoiceTalkRoom } from './voice-talk-room-context'
import { voiceTalkCopy } from '@/i18n/voice-talk-copy'

/**
 * The message a voice talk leaves when it starts: who started it, and a Join
 * button that works for as long as that call is live. Declining the call when
 * it rang does not remove this, so it is also the way back in.
 */
export default function VoiceCallStartedBubble(props: {
  message: VoiceCallMessage
  speakerName: string
  isOwnMessage: boolean
  locale: string
}) {
  const copy = voiceTalkCopy(props.locale)
  const room = useVoiceTalkRoom()
  const state = room
    ? resolveVoiceCallMessageState({ message: props.message, liveCallId: room.liveCallId, joined: room.joined })
    : 'ended'
  const name = props.speakerName.trim()
  const title = props.isOwnMessage ? copy.messageStartedByMe : name ? copy.startedBy(name) : copy.startedBySomeone
  const live = state !== 'ended'

  return (
    <div
      data-voice-call-message={props.message.callId}
      data-voice-call-state={state}
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
          {live ? <Phone size={17} strokeWidth={2.3} /> : <PhoneOff size={17} strokeWidth={2.3} />}
        </span>
        <p className={`min-w-0 flex-1 text-[0.94rem] font-semibold leading-snug ${live ? 'text-gray-900' : 'text-gray-500'}`}>
          {title}
        </p>
      </div>
      {state === 'joinable' ? (
        <button
          type="button"
          data-qa="voice-call-message-join"
          onClick={() => room?.join()}
          className="mt-2.5 flex h-11 w-full items-center justify-center rounded-xl bg-emerald-500 text-[0.92rem] font-semibold text-white active:bg-emerald-600"
        >
          {copy.messageJoin}
        </button>
      ) : (
        <p
          data-qa="voice-call-message-status"
          className={`mt-2 text-center text-[0.8rem] font-medium ${state === 'joined' ? 'text-emerald-700' : 'text-gray-400'}`}
        >
          {state === 'joined' ? copy.joined : copy.ended}
        </p>
      )}
    </div>
  )
}
