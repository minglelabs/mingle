'use client'

// The room menu's Hash Rush page: what the room's game is doing, the way into
// it (create one, join the running one, or back to the one this phone is in),
// the computer link, the rankings and how to play.

import { BookOpen, ChevronRight, Gamepad2, Link2, Trophy } from 'lucide-react'
import type { HashRushRoomGame } from '@/lib/hash-rush-message'
import { hashRushInviteCopy } from './invite-copy'

type Props = {
  uiLocale: string
  game: HashRushRoomGame | null
  playing: boolean
  viewerUserId: string | null
  onEnter: () => void
  /** Absent when no computer page is set up. */
  onCopyPcLink?: () => void
  onOpenRanking: () => void
  onOpenHowTo: () => void
}

function Row({ icon, label, hint, onClick, qa }: { icon: React.ReactNode, label: string, hint?: string, onClick: () => void, qa: string }) {
  return (
    <button
      type="button"
      data-qa={qa}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left text-[0.98rem] font-medium text-gray-900 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint ? <span className="mt-0.5 block text-[0.8rem] font-normal text-gray-500">{hint}</span> : null}
      </span>
      <ChevronRight size={18} strokeWidth={2.4} className="shrink-0 text-gray-400" />
    </button>
  )
}

export default function HashRushMenuPage({ uiLocale, game, playing, viewerUserId, onEnter, onCopyPcLink, onOpenRanking, onOpenHowTo }: Props) {
  const copy = hashRushInviteCopy(uiLocale)
  const starter = game?.startedBy
  const starterName = starter && starter.userId !== viewerUserId ? (starter.name ?? '').trim() : ''
  const status = playing
    ? copy.statusPlaying
    : game
      ? starterName ? copy.statusLive(starterName) : copy.statusLiveSomeone
      : copy.statusNone
  const action = playing ? copy.backToGame : game ? copy.join : copy.create

  return (
    <div className="space-y-4 px-4 py-4" data-qa="hash-rush-menu-page">
      <div className={`rounded-2xl border px-4 py-4 ${game || playing ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${game || playing ? 'bg-emerald-500' : 'bg-gray-300'}`}>
            <Gamepad2 size={20} strokeWidth={2.3} />
          </span>
          <p className="min-w-0 flex-1 text-[0.95rem] font-semibold leading-snug text-gray-900" data-qa="hash-rush-menu-status">{status}</p>
        </div>
        <button
          type="button"
          data-qa="hash-rush-menu-enter"
          onClick={onEnter}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-emerald-500 text-[0.95rem] font-semibold text-white active:bg-emerald-600"
        >
          {action}
        </button>
      </div>

      <div>
        <Row qa="hash-rush-menu-ranking" icon={<Trophy size={18} strokeWidth={2.2} />} label={copy.ranking} onClick={onOpenRanking} />
        <Row qa="hash-rush-menu-howto" icon={<BookOpen size={18} strokeWidth={2.2} />} label={copy.howTo} onClick={onOpenHowTo} />
        {onCopyPcLink ? (
          <Row qa="hash-rush-menu-pc-link" icon={<Link2 size={18} strokeWidth={2.2} />} label={copy.pcLink} hint={copy.pcLinkHint} onClick={onCopyPcLink} />
        ) : null}
      </div>
    </div>
  )
}
