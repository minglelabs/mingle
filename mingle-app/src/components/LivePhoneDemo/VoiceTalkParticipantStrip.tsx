'use client'

import LanguageFlag from '@/components/language-flag'

export type VoiceTalkParticipantChip = {
  userId: string
  name: string
  image: string | null
  /** The language they speak in the call ('' when unknown: no flag). */
  lang: string
}

function initial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? Array.from(trimmed)[0]!.toUpperCase() : '?'
}

/** Two lists say the same people in the same order. */
export function sameVoiceTalkParticipants(left: readonly VoiceTalkParticipantChip[], right: readonly VoiceTalkParticipantChip[]): boolean {
  return left.length === right.length && left.every((chip, index) => {
    const other = right[index]
    return !!other && chip.userId === other.userId && chip.name === other.name && chip.image === other.image && chip.lang === other.lang
  })
}

/**
 * Who is in a voice talk, small: round photos in a row, each with the flag of
 * the language they speak, and "+N" past `max`. Shown where someone decides
 * whether to join (the join dialog, the "started a voice talk" message).
 */
export default function VoiceTalkParticipantStrip(props: {
  participants: readonly VoiceTalkParticipantChip[]
  max?: number
  className?: string
}) {
  const max = props.max ?? 6
  if (props.participants.length === 0) return null
  const shown = props.participants.slice(0, max)
  const more = props.participants.length - shown.length
  return (
    <div data-qa="voice-talk-participant-strip" className={`flex flex-wrap items-center justify-center gap-2 ${props.className ?? ''}`}>
      {shown.map((chip) => (
        <span key={chip.userId} data-qa="voice-talk-participant-chip" title={chip.name || undefined} className="relative inline-flex h-8 w-8 shrink-0">
          <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-[0.72rem] font-bold text-amber-800 ring-2 ring-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {chip.image ? <img src={chip.image} alt="" className="h-full w-full object-cover" /> : initial(chip.name)}
          </span>
          {chip.lang ? (
            <span
              aria-hidden="true"
              data-qa="voice-talk-participant-flag"
              className="pointer-events-none absolute -bottom-[2px] -left-[3px] flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-white px-[1px] ring-1 ring-gray-200"
            >
              <LanguageFlag language={chip.lang} className="text-[9px] leading-none" />
            </span>
          ) : null}
        </span>
      ))}
      {more > 0 ? (
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-gray-100 px-1.5 text-[0.72rem] font-semibold text-gray-600">+{more}</span>
      ) : null}
    </div>
  )
}
