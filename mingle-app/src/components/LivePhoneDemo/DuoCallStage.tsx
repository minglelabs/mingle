'use client'

import { Headphones, Languages, Loader2, Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import FlagEmoji from '@/components/flag-emoji'
import type { AppLocale } from '@/i18n'
import { formatProfileAge } from '@/i18n/profile-age-copy'
import { countryFlagEmoji, getCountryDisplayName } from '@/lib/nationality'
import type { PostCallPeer } from '@/lib/post-call'

/**
 * The screen of a 1:1 voice talk from a post (owner, 2026-11-25): the whole
 * screen is the other person's photo, blurred and dimmed, with a soft light
 * where their face is drawn, round, a third of the way down. The face ripples
 * while they speak. Under it: who they are, and the call's buttons
 * (translate, read aloud, mic, hang up). The room's own top bar (language
 * button) and bottom bar (text box) stay, see-through; what is said and
 * written runs under the buttons, as in any room.
 *
 * Presentational only: the call and its rules are in VoiceTalkPanel
 * (variant 'duo') and src/server/post-calls.ts.
 */
export type DuoCallPhase =
  /** The caller waits while the author's phone rings. */
  | 'ringing_out'
  /** The author is being rung (opened from the push). */
  | 'ringing_in'
  | 'connecting'
  | 'talking'
  | 'over'

export type DuoCallStageLabels = {
  waiting: string
  incoming: string
  accept: string
  decline: string
  cancel: string
  hangUp: string
  connecting: string
  translate: string
  readAloud: string
  mic: string
  micMuted: string
}

export type DuoCallStageProps = {
  locale: string
  labels: DuoCallStageLabels
  peer: PostCallPeer | null
  phase: DuoCallPhase
  /** Seconds left on the ring. */
  secondsLeft: number
  /** What to say when the call is over (not connected, or ended). */
  overText: string
  /** A line under the buttons (a call error). */
  note: string | null
  peerSpeaking: boolean
  /** False once the other one muted their mic. */
  peerMicOn: boolean
  micOn: boolean
  interpretOn: boolean
  /** Translations are read aloud (only while interpreting). */
  listenOn: boolean
  earphonesConnected: boolean
  busy: boolean
  onAccept: () => void
  onHangUp: () => void
  onToggleMic: () => void
  onToggleInterpret: () => void
  onToggleListen: () => void
  onOpenProfile?: (userId: string) => void
  /**
   * What is said is being written down under the buttons (interpretation is
   * on): the face moves up a little so the lines have room.
   */
  compact?: boolean
  /** The block with the face and the buttons: the room's messages start under it. */
  blockRef?: Ref<HTMLDivElement>
}

const FACE_PX = 116
/** Where the face's centre is, in % of the screen from the top (owner: about 35). */
const FACE_CENTER = 35
const FACE_CENTER_COMPACT = 24

function initial(name: string | null | undefined): string {
  const trimmed = (name || '').trim()
  return trimmed ? Array.from(trimmed)[0].toUpperCase() : '?'
}

/** A round button with its name under it, on the dark backdrop. */
function CallButton(props: { qa: string; label: string; tone: 'idle' | 'on' | 'end' | 'answer'; big?: boolean; disabled?: boolean; onPress: () => void; children: ReactNode }) {
  const tone = props.tone === 'on'
    ? 'bg-amber-400 text-white'
    : props.tone === 'end'
      ? 'bg-rose-500 text-white'
      : props.tone === 'answer'
        ? 'bg-emerald-500 text-white'
        : 'bg-white/18 text-white'
  return (
    <button
      type="button"
      data-qa={props.qa}
      aria-label={props.label}
      aria-pressed={props.tone === 'on' ? true : props.tone === 'idle' ? false : undefined}
      disabled={props.disabled}
      onClick={props.onPress}
      className="pointer-events-auto flex w-[68px] flex-col items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
    >
      <span className={`inline-flex items-center justify-center rounded-full backdrop-blur-md ${props.big ? 'h-16 w-16' : 'h-[52px] w-[52px]'} ${tone}`}>
        {props.children}
      </span>
      <span className="max-w-full truncate text-[11px] font-semibold leading-none text-white/85">{props.label}</span>
    </button>
  )
}

export default function DuoCallStage({ blockRef, ...props }: DuoCallStageProps) {
  const { labels, peer, phase } = props
  const ringing = phase === 'ringing_out' || phase === 'ringing_in'
  const country = peer?.country ? getCountryDisplayName(peer.country, props.locale as AppLocale) : ''
  const age = typeof peer?.age === 'number' ? formatProfileAge(peer.age, props.locale as AppLocale) : ''
  const status = phase === 'ringing_out'
    ? labels.waiting
    : phase === 'ringing_in'
      ? labels.incoming
      : phase === 'connecting'
        ? labels.connecting
        : phase === 'over'
          ? props.overText
          : !props.peerMicOn
            ? labels.micMuted
            : ''
  const listening = props.interpretOn && props.listenOn

  return (
    <>
      {/* The whole screen: the other person's photo, blurred, dimmed, lit where the face is. */}
      <div aria-hidden="true" data-qa="duo-call-backdrop" className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-slate-900">
        {peer?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={peer.image} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover blur-3xl saturate-125" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-amber-700 via-slate-800 to-slate-950" />
        )}
        <div className="absolute inset-0 bg-slate-950/55" />
        {/* The eye goes to the face: light around it, dark toward the edges. */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(circle at 50% 35%, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.05) 26%, rgba(2,6,23,0) 46%, rgba(2,6,23,0.50) 100%)' }}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 z-30 transition-[top] duration-300 ease-out"
        style={{ top: `calc(${props.compact && phase === 'talking' ? FACE_CENTER_COMPACT : FACE_CENTER}% - ${FACE_PX / 2}px)` }}
        data-qa="duo-call-stage"
        data-duo-call-phase={phase}
      >
        <div ref={blockRef} className="flex flex-col items-center px-6 pb-3">
          <button
            type="button"
            data-qa="duo-call-peer"
            aria-label={peer?.name || ''}
            disabled={!peer || !props.onOpenProfile}
            onClick={() => (peer ? props.onOpenProfile?.(peer.userId) : undefined)}
            className="pointer-events-auto relative flex items-center justify-center"
            style={{ width: FACE_PX, height: FACE_PX }}
          >
            {/* Waves from the face: while they speak, and slower while it rings. */}
            {props.peerSpeaking && phase === 'talking' ? (
              <>
                <span aria-hidden="true" data-qa="duo-call-peer-wave" className="mingle-voice-ripple absolute inset-0 rounded-full bg-emerald-300/70" />
                <span aria-hidden="true" className="mingle-voice-ripple mingle-voice-ripple-late absolute inset-0 rounded-full bg-emerald-300/50" />
              </>
            ) : ringing || phase === 'connecting' ? (
              <>
                <span aria-hidden="true" className="mingle-call-ring absolute inset-0 rounded-full bg-white/35" />
                <span aria-hidden="true" className="mingle-call-ring mingle-call-ring-late absolute inset-0 rounded-full bg-white/25" />
              </>
            ) : null}
            <span
              className={`relative inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-amber-100 text-[2.4rem] font-bold text-amber-800 shadow-[0_18px_48px_rgba(2,6,23,0.5)] ring-[3px] transition-shadow duration-200 ${
                props.peerSpeaking && phase === 'talking' ? 'ring-emerald-300' : 'ring-white/70'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {peer?.image ? <img src={peer.image} alt="" className="h-full w-full object-cover" /> : initial(peer?.name)}
            </span>
            {phase === 'talking' && !props.peerMicOn ? (
              <span className="absolute bottom-0 right-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white ring-2 ring-white/70">
                <MicOff size={15} strokeWidth={2.4} aria-hidden="true" />
              </span>
            ) : null}
          </button>

          <p className="mt-3.5 max-w-full truncate text-[1.3rem] font-bold leading-tight text-white drop-shadow-[0_1px_6px_rgba(2,6,23,0.6)]" data-qa="duo-call-peer-name">
            {peer?.name || ''}
          </p>
          {country || age ? (
            <p className="mt-1 flex max-w-full items-center gap-1.5 truncate text-[0.92rem] font-medium text-white/85" data-qa="duo-call-peer-profile">
              {peer?.country ? <FlagEmoji emoji={countryFlagEmoji(peer.country)} className="text-[1rem] leading-none" /> : null}
              <span className="truncate">{[country, age].filter(Boolean).join(' · ')}</span>
            </p>
          ) : null}

          {status ? (
            <p role="status" className="mt-2 flex items-center gap-1.5 text-[0.9rem] font-semibold text-white/90" data-qa="duo-call-status">
              {phase === 'connecting' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
              {status}
              {ringing ? <span className="tabular-nums text-white">· {props.secondsLeft}</span> : null}
            </p>
          ) : null}

          {phase === 'ringing_in' ? (
            <div className="mt-4 flex items-start justify-center gap-12">
              <CallButton qa="duo-call-decline" label={labels.decline} tone="end" big disabled={props.busy} onPress={props.onHangUp}>
                <PhoneOff size={26} strokeWidth={2.2} />
              </CallButton>
              <CallButton qa="duo-call-accept" label={labels.accept} tone="answer" big disabled={props.busy} onPress={props.onAccept}>
                <Phone size={26} strokeWidth={2.2} />
              </CallButton>
            </div>
          ) : phase === 'ringing_out' ? (
            <div className="mt-4 flex justify-center">
              <CallButton qa="duo-call-cancel" label={labels.cancel} tone="end" big disabled={props.busy} onPress={props.onHangUp}>
                <PhoneOff size={26} strokeWidth={2.2} />
              </CallButton>
            </div>
          ) : phase === 'over' ? null : (
            <div className="mt-4 flex items-start justify-center gap-2">
              <CallButton qa="duo-call-translate" label={labels.translate} tone={props.interpretOn ? 'on' : 'idle'} onPress={props.onToggleInterpret}>
                <Languages size={22} strokeWidth={2.2} />
              </CallButton>
              <CallButton qa="duo-call-read-aloud" label={labels.readAloud} tone={listening ? 'on' : 'idle'} onPress={props.onToggleListen}>
                {!listening ? <VolumeX size={22} strokeWidth={2.2} /> : props.earphonesConnected ? <Headphones size={22} strokeWidth={2.2} /> : <Volume2 size={22} strokeWidth={2.2} />}
              </CallButton>
              <CallButton qa="duo-call-mic" label={labels.mic} tone={props.micOn ? 'on' : 'idle'} onPress={props.onToggleMic}>
                {props.micOn ? <Mic size={22} strokeWidth={2.2} /> : <MicOff size={22} strokeWidth={2.2} />}
              </CallButton>
              <CallButton qa="duo-call-hang-up" label={labels.hangUp} tone="end" onPress={props.onHangUp}>
                <PhoneOff size={22} strokeWidth={2.2} />
              </CallButton>
            </div>
          )}
          {props.note ? <p role="status" className="mt-2 text-center text-[0.82rem] font-medium text-rose-200">{props.note}</p> : null}
        </div>
      </div>
    </>
  )
}

/**
 * The viewer's own face in the bottom bar of the call screen, left of the
 * text box: it ripples while they speak, and shows a muted mic.
 */
export function DuoCallSelfFace({ image, name, speaking, micOn, sizePx }: { image: string | null; name: string | null; speaking: boolean; micOn: boolean; sizePx: number }) {
  return (
    <span className="relative mb-0.5 inline-flex shrink-0 items-center justify-center" style={{ width: sizePx, height: sizePx }} data-qa="duo-call-self" data-speaking={speaking ? 'true' : 'false'}>
      {speaking && micOn ? (
        <>
          <span aria-hidden="true" className="mingle-voice-ripple absolute inset-0 rounded-full bg-emerald-300/80" />
          <span aria-hidden="true" className="mingle-voice-ripple mingle-voice-ripple-late absolute inset-0 rounded-full bg-emerald-300/60" />
        </>
      ) : null}
      <span className={`relative inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-amber-100 text-[0.9rem] font-bold text-amber-800 ring-2 ${speaking && micOn ? 'ring-emerald-300' : 'ring-white/70'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : initial(name)}
      </span>
      {!micOn ? (
        <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-white ring-1 ring-white/70">
          <MicOff size={9} strokeWidth={2.6} aria-hidden="true" />
        </span>
      ) : null}
    </span>
  )
}
