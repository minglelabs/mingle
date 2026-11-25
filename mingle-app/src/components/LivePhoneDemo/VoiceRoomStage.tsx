'use client'

import { ArrowDown, ArrowUp, ChevronUp, Crown, Hand, Headphones, Languages, Loader2, Mic, MicOff, PhoneOff, Plus, Volume2, VolumeX } from 'lucide-react'
import type { ReactNode } from 'react'
import LanguageFlag from '@/components/language-flag'

/**
 * The voice room screen's stage (owner, 2026-11-25): what an open room shows
 * under its top bar instead of the small voice talk panel. The layout follows
 * the voice rooms of language-exchange apps: a fixed grid of seats (the host
 * first, empty seats shown), the people who only listen in a row under it,
 * and round labelled buttons; the room's chat runs below. Colours are ours
 * (warm amber on white).
 *
 * Presentational only: the call itself, and every rule about who may do what,
 * stays in VoiceTalkPanel, which renders this for an open room.
 */
export type VoiceRoomSeat = {
  key: string
  userId: string
  name: string
  isLocal: boolean
  isSpeaking: boolean
  image: string | null
  /** Speech language, for the flag. Empty = no flag. */
  lang: string
  micOn: boolean
}

export type VoiceRoomListener = { userId: string; name: string | null; image: string | null; handRaised: boolean }
export type VoiceRoomBystander = { id: string; name: string | null; image: string | null; viewing: boolean }

export type VoiceRoomStageLabels = {
  /** The line next to the live dot, e.g. "Voice talk · 3". */
  status: string
  join: string
  host: string
  me: string
  emptySeat: string
  micMuted: string
  mic: string
  hand: string
  lowerHand: string
  interpret: string
  listen: string
  leave: string
  audience: string
  quiet: string
  toStage: string
  offStage: string
  stepDown: string
  fold: string
  open: string
}

export type VoiceRoomStageProps = {
  labels: VoiceRoomStageLabels
  /** Seats on the stage, in order; empty seats fill the row (see voiceRoomSlotCount), up to `seatCount`. */
  seats: readonly VoiceRoomSeat[]
  seatCount: number
  hostUserId: string | null
  viewerUserId: string | null
  listeners: readonly VoiceRoomListener[]
  bystanders: readonly VoiceRoomBystander[]
  /** This phone is in the call (or connecting to it). */
  joined: boolean
  connecting: boolean
  /** The call has a stage: listeners raise a hand, the host moves people. */
  stageEnabled: boolean
  isHost: boolean
  myRole: 'speaker' | 'listener' | null
  myHandRaised: boolean
  micOn: boolean
  interpretOn: boolean
  listenOn: boolean
  earphonesConnected: boolean
  busy: boolean
  folded: boolean
  error: string | null
  note: string | null
  onJoin: () => void
  onLeave: () => void
  onToggleMic: () => void
  onToggleHand: () => void
  onToggleInterpret: () => void
  onToggleListen: () => void
  onInvite: (userId: string) => void
  onRemove: (userId: string) => void
  onStepDown: () => void
  onOpenProfile?: (userId: string) => void
  onToggleFold: () => void
}

/**
 * How many seats are drawn: whole rows of four, always with at least one
 * empty seat while the stage has room, so a quiet room is one row and not
 * two rows of blanks (the chat below needs the space).
 */
export function voiceRoomSlotCount(seated: number, seatCount: number): number {
  const rows = Math.max(1, Math.ceil((seated + 1) / 4))
  return Math.min(seatCount, rows * 4)
}

function initial(name: string | null | undefined): string {
  const trimmed = (name || '').trim()
  return trimmed ? Array.from(trimmed)[0].toUpperCase() : '?'
}

function Face({ image, name, className }: { image: string | null; name: string | null; className: string }) {
  return (
    <span className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-amber-100 font-bold text-amber-800 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : initial(name)}
    </span>
  )
}

/** A round button with its name under it. */
function StageButton(props: {
  qa: string
  label: string
  tone: 'idle' | 'red' | 'green' | 'amber' | 'dark'
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const tone = {
    idle: 'bg-white text-slate-500 ring-1 ring-slate-200 active:bg-slate-50',
    red: 'bg-red-500 text-white shadow-[0_6px_14px_rgba(239,68,68,0.3)] active:bg-red-600',
    green: 'bg-emerald-500 text-white shadow-[0_6px_14px_rgba(16,185,129,0.28)] active:bg-emerald-600',
    amber: 'bg-amber-400 text-white shadow-[0_6px_14px_rgba(245,158,11,0.3)] active:bg-amber-500',
    dark: 'bg-slate-900 text-white active:bg-slate-800',
  }[props.tone]
  return (
    <button
      type="button"
      data-qa={props.qa}
      aria-pressed={props.pressed}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="flex w-[64px] flex-col items-center gap-1 disabled:opacity-40"
    >
      <span className={`inline-flex h-12 w-12 items-center justify-center rounded-full transition-colors ${tone}`}>{props.children}</span>
      <span className="w-full truncate text-center text-[0.68rem] font-semibold text-slate-600">{props.label}</span>
    </button>
  )
}

export default function VoiceRoomStage(props: VoiceRoomStageProps) {
  const { labels, seats, hostUserId, viewerUserId, listeners, bystanders } = props
  const slots: Array<VoiceRoomSeat | null> = [...seats.slice(0, props.seatCount)]
  const slotCount = voiceRoomSlotCount(slots.length, props.seatCount)
  while (slots.length < slotCount) slots.push(null)
  const audienceCount = listeners.length + bystanders.length
  // An empty seat is a way in: join the voice talk, or (a listener) ask for the stage.
  const emptySeatAction = !props.joined
    ? props.onJoin
    : props.stageEnabled && props.myRole === 'listener' && !props.myHandRaised ? props.onToggleHand : null

  return (
    <section
      data-qa="voice-room-stage"
      data-folded={props.folded ? 'true' : 'false'}
      className="pointer-events-auto overflow-hidden border-b border-amber-100 bg-gradient-to-b from-amber-50 via-[#FFF9EE] to-white"
    >
      {/* Status row: always shown; the folded stage is only this row. */}
      <div
        data-qa="voice-room-status"
        className={`flex items-center gap-2 px-4 py-2 ${props.folded ? 'cursor-pointer' : ''}`}
        onClick={props.folded ? props.onToggleFold : undefined}
      >
        <span className="relative inline-flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.86rem] font-bold text-slate-900">{labels.status}</span>
        {props.folded ? (
          <span className="flex shrink-0 -space-x-2">
            {seats.slice(0, 4).map((seat) => (
              <Face key={seat.key} image={seat.image} name={seat.name} className={`h-6 w-6 border-2 text-[0.62rem] ${seat.isSpeaking && seat.micOn ? 'border-amber-400' : 'border-white'}`} />
            ))}
          </span>
        ) : audienceCount > 0 ? (
          <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[0.7rem] font-semibold text-slate-600 ring-1 ring-amber-100">{labels.audience}</span>
        ) : null}
        <button
          type="button"
          data-qa="voice-room-fold"
          aria-label={props.folded ? labels.open : labels.fold}
          onClick={(event) => {
            event.stopPropagation()
            props.onToggleFold()
          }}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-amber-100"
        >
          <ChevronUp size={18} strokeWidth={2.4} className={`transition-transform duration-300 ${props.folded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {props.folded ? null : (
        <>
          {/* The stage: a fixed grid, four seats to a row, empty seats shown. */}
          <div data-qa="voice-room-seats" className="grid grid-cols-4 gap-y-3 px-3 pb-1 pt-1">
            {slots.map((seat, index) => {
              if (!seat) {
                const body = (
                  <>
                    <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-amber-300 bg-white/70 text-amber-400">
                      <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="w-full truncate text-center text-[0.7rem] font-medium text-slate-400">{labels.emptySeat}</span>
                  </>
                )
                return emptySeatAction ? (
                  <button key={`empty-${index}`} type="button" data-qa="voice-room-empty-seat" onClick={emptySeatAction} className="flex min-w-0 flex-col items-center gap-1">
                    {body}
                  </button>
                ) : (
                  <div key={`empty-${index}`} data-qa="voice-room-empty-seat" className="flex min-w-0 flex-col items-center gap-1">{body}</div>
                )
              }
              const speaking = seat.isSpeaking && seat.micOn
              const isHostSeat = !!hostUserId && seat.userId === hostUserId
              const name = seat.isLocal ? labels.me : seat.name
              const face = (
                <span className={`relative inline-flex h-14 w-14 items-center justify-center rounded-full ${speaking ? 'ring-[3px] ring-amber-400 ring-offset-2 ring-offset-[#FFF9EE]' : ''}`}>
                  {speaking ? <span aria-hidden="true" data-qa="voice-room-seat-speaking" className="mingle-voice-ripple pointer-events-none absolute inset-0 rounded-full bg-amber-400/40" /> : null}
                  <Face image={seat.image} name={seat.name} className="relative h-14 w-14 text-[1.05rem]" />
                  {seat.micOn ? null : (
                    <span data-qa="voice-room-seat-muted" aria-label={labels.micMuted} className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white ring-2 ring-white">
                      <MicOff size={11} strokeWidth={2.6} />
                    </span>
                  )}
                  {seat.lang ? (
                    <span aria-hidden="true" className="pointer-events-none absolute -bottom-0.5 -left-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-[2px] ring-1 ring-amber-100">
                      <LanguageFlag language={seat.lang} className="text-[11px] leading-none" />
                    </span>
                  ) : null}
                  {isHostSeat ? (
                    <span data-qa="voice-room-host" aria-label={labels.host} title={labels.host} className="absolute -top-1.5 left-1/2 inline-flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-amber-400 text-white ring-2 ring-white">
                      <Crown size={11} strokeWidth={2.6} />
                    </span>
                  ) : null}
                </span>
              )
              return (
                <div key={seat.key} data-qa="voice-room-seat" className="relative flex min-w-0 flex-col items-center gap-1">
                  {props.onOpenProfile && !seat.isLocal ? (
                    <button type="button" aria-label={name} onClick={() => props.onOpenProfile?.(seat.userId)} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                      {face}
                    </button>
                  ) : face}
                  <span className={`w-full truncate px-1 text-center text-[0.72rem] font-semibold ${seat.isLocal ? 'text-amber-700' : 'text-slate-700'}`}>{name}</span>
                  {/* The host takes a speaker off the stage. */}
                  {props.stageEnabled && props.isHost && seat.userId !== viewerUserId ? (
                    <button
                      type="button"
                      data-qa="voice-room-remove"
                      aria-label={labels.offStage}
                      title={labels.offStage}
                      disabled={props.busy}
                      onClick={() => props.onRemove(seat.userId)}
                      className="absolute right-1 top-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white shadow disabled:opacity-50"
                    >
                      <ArrowDown size={12} strokeWidth={2.6} />
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>

          {seats.length === 0 && !props.connecting ? <p className="px-4 pb-1 pt-1 text-center text-[0.8rem] text-slate-500">{labels.quiet}</p> : null}
          {props.error ? <p role="alert" className="px-4 pb-1 pt-1 text-center text-[0.8rem] text-rose-600">{props.error}</p> : null}
          {props.note ? <p data-qa="voice-room-note" role="status" className="px-4 pb-1 pt-1 text-center text-[0.8rem] font-semibold text-emerald-700">{props.note}</p> : null}

          {/* The people who only listen, then everyone else in the room: one row that scrolls sideways. */}
          {audienceCount > 0 ? (
            <div data-qa="voice-room-audience" className="flex items-center gap-2 overflow-x-auto px-4 pb-1 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {listeners.map((listener) => {
                const face = (
                  <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center">
                    <Face image={listener.image} name={listener.name} className="h-9 w-9 text-[0.75rem]" />
                    {listener.handRaised ? (
                      <span data-qa="voice-room-hand" className="absolute -right-1 -top-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-amber-400 text-white ring-2 ring-white">
                        <Hand size={10} strokeWidth={2.6} />
                      </span>
                    ) : null}
                    {props.isHost ? (
                      <span aria-hidden="true" className="absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
                        <ArrowUp size={9} strokeWidth={3} />
                      </span>
                    ) : null}
                  </span>
                )
                return props.isHost ? (
                  <button key={listener.userId} type="button" data-qa="voice-room-invite" aria-label={`${labels.toStage}: ${listener.name || ''}`} title={labels.toStage} disabled={props.busy} onClick={() => props.onInvite(listener.userId)} className="shrink-0 disabled:opacity-50">
                    {face}
                  </button>
                ) : (
                  <button key={listener.userId} type="button" data-qa="voice-room-listener" aria-label={listener.name || labels.audience} onClick={() => { if (listener.userId !== viewerUserId) props.onOpenProfile?.(listener.userId) }} className="shrink-0">
                    {face}
                  </button>
                )
              })}
              {bystanders.map((member) => (
                <span key={member.id} data-qa="voice-room-bystander" title={member.name || undefined} className={`shrink-0 transition-opacity duration-300 ${member.viewing ? '' : 'opacity-40'}`}>
                  <Face image={member.image} name={member.name} className="h-7 w-7 text-[0.62rem]" />
                </span>
              ))}
            </div>
          ) : null}

          {/* The buttons: one wide button to come in, or the round ones of someone who is in. */}
          <div data-qa="voice-room-controls" className="flex items-start justify-center gap-2 px-3 pb-3 pt-3">
            {!props.joined ? (
              <button
                type="button"
                data-qa="voice-room-join"
                onClick={props.onJoin}
                className="inline-flex h-12 w-full max-w-[320px] items-center justify-center gap-2 rounded-full bg-amber-400 px-5 text-[0.95rem] font-bold text-white shadow-[0_8px_18px_rgba(245,158,11,0.32)] transition active:scale-[0.985] active:bg-amber-500"
              >
                <Mic size={18} strokeWidth={2.4} aria-hidden="true" />
                {labels.join}
              </button>
            ) : (
              <>
                {props.stageEnabled && props.myRole === 'listener' ? (
                  <StageButton qa="voice-room-raise-hand" label={props.myHandRaised ? labels.lowerHand : labels.hand} tone={props.myHandRaised ? 'amber' : 'idle'} pressed={props.myHandRaised} disabled={props.busy} onClick={props.onToggleHand}>
                    <Hand size={21} />
                  </StageButton>
                ) : (
                  <StageButton qa="voice-room-mic" label={labels.mic} tone={props.micOn ? 'red' : 'idle'} pressed={props.micOn} onClick={props.onToggleMic}>
                    {props.connecting ? <Loader2 size={20} className="animate-spin" /> : props.micOn ? <Mic size={21} /> : <MicOff size={21} />}
                  </StageButton>
                )}
                <StageButton qa="voice-room-interpret" label={labels.interpret} tone={props.interpretOn ? 'green' : 'idle'} pressed={props.interpretOn} onClick={props.onToggleInterpret}>
                  <Languages size={21} />
                </StageButton>
                <StageButton qa="voice-room-listen" label={labels.listen} tone={props.interpretOn && props.listenOn ? 'amber' : 'idle'} pressed={props.interpretOn && props.listenOn} disabled={!props.interpretOn} onClick={props.onToggleListen}>
                  {props.earphonesConnected ? <Headphones size={21} /> : props.listenOn ? <Volume2 size={21} /> : <VolumeX size={21} />}
                </StageButton>
                {/* Someone the host put on the stage can step off it themselves. */}
                {props.stageEnabled && props.myRole === 'speaker' && !props.isHost ? (
                  <StageButton qa="voice-room-step-down" label={labels.stepDown} tone="idle" disabled={props.busy} onClick={props.onStepDown}>
                    <ArrowDown size={21} />
                  </StageButton>
                ) : null}
                <StageButton qa="voice-room-leave" label={labels.leave} tone="dark" onClick={props.onLeave}>
                  <PhoneOff size={20} />
                </StageButton>
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
