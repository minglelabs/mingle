'use client'

// What only an open room (a public room, listed under Explore) has on the room
// screen: the row of people who have the room open right now, and the part of
// the room menu with share / minimize / leave, the room's topic and lock, host
// settings (the host changes the topic and the password), report, and the other
// rooms to move to.

import { Flag, Loader2, Lock, LogOut, Minimize2, Settings2, Share, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import LanguageFlag from '@/components/language-flag'
import ReportSheet from '@/components/reports/report-sheet'
import { buildClientApiPath } from '@/lib/api-contract'
import { useRoomPresence } from '@/lib/room-presence'
import { liveRoomsCopy } from '@/i18n/live-rooms-copy'
import { openRoomsCopy } from '@/i18n/open-rooms-copy'
import { reportCopy } from '@/i18n/report-copy'
import {
  OPEN_ROOM_PASSWORD_MAX,
  OPEN_ROOM_TOPIC_MAX,
  openRoomStatus,
  parseOpenRooms,
  readOpenRoomPassword,
  type OpenRoomCard,
} from '@/lib/open-room'
import type { ConversationChannelSummary } from '@/lib/app-conversations'
import { parseRoomMemberSummaries } from './VoiceTalkPanel'
import { openRoomPeopleNeedReload, resolveOpenRoomPeople, type OpenRoomMember } from './open-room-people'

export type OpenRoomInfo = {
  id: string
  title: string
  isPublic: boolean
  topic: string | null
  hasPassword: boolean
  isHost: boolean
  hostUserId: string
}

export function parseOpenRoomInfo(body: unknown): OpenRoomInfo | null {
  const room = (body as { room?: Partial<OpenRoomInfo> } | null)?.room
  if (!room || typeof room.id !== 'string') return null
  return {
    id: room.id,
    title: typeof room.title === 'string' ? room.title : '',
    isPublic: room.isPublic === true,
    topic: typeof room.topic === 'string' && room.topic ? room.topic : null,
    hasPassword: room.hasPassword === true,
    isHost: room.isHost === true,
    hostUserId: typeof room.hostUserId === 'string' ? room.hostUserId : '',
  }
}

/** The room's open-room facts, loaded while `active`; null until known or for a room the viewer is not in. */
export function useOpenRoomInfo(conversationId: string | null | undefined, active: boolean): {
  info: OpenRoomInfo | null
  setInfo: (info: OpenRoomInfo | null) => void
} {
  const [info, setInfo] = useState<OpenRoomInfo | null>(null)
  useEffect(() => {
    if (!active || !conversationId) return
    let cancelled = false
    void fetch(buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/open-room`), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (!cancelled) setInfo(parseOpenRoomInfo(body)) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [active, conversationId])
  return { info, setInfo }
}

function Face({ person, size }: { person: { name: string | null; image: string | null }; size: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-gray-400" style={{ width: size, height: size }}>
      {person.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.image} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <UserRound size={Math.round(size * 0.58)} strokeWidth={2} aria-hidden="true" />
      )}
    </span>
  )
}

/** The row of everyone who has the open room open right now. A face opens that person's profile. */
export function OpenRoomPeopleStrip({
  conversationId,
  viewerUserId,
  locale,
  onOpenProfile,
}: {
  conversationId: string
  viewerUserId: string | null | undefined
  locale: string
  onOpenProfile?: (userId: string) => void
}) {
  const copy = useMemo(() => openRoomsCopy(locale), [locale])
  const presence = useRoomPresence(conversationId)
  const [members, setMembers] = useState<OpenRoomMember[]>([])
  const [loadedFor, setLoadedFor] = useState('')
  // Load once, and again when someone is here whom the loaded list does not know.
  const presenceKey = presence ? presence.join(',') : ''
  const stale = loadedFor !== presenceKey && openRoomPeopleNeedReload(members, presence)
  const needLoad = loadedFor === '' || stale
  useEffect(() => {
    if (!needLoad) return
    let cancelled = false
    void fetch(buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/members`), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled) return
        setMembers(parseRoomMemberSummaries(body))
        setLoadedFor(presenceKey || 'loaded')
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [conversationId, needLoad, presenceKey])

  const people = useMemo(() => resolveOpenRoomPeople({ members, presence, viewerUserId }), [members, presence, viewerUserId])
  if (people.length === 0) return null
  return (
    <div
      data-qa="open-room-people"
      aria-label={copy.hereNow}
      className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-gray-100 bg-white px-3 py-1.5 [scrollbar-width:none]"
    >
      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-700">{people.length}</span>
      {people.map((person) => (
        <button
          key={person.id}
          type="button"
          data-qa="open-room-person"
          aria-label={person.name || copy.hereNow}
          title={person.name || undefined}
          onClick={() => {
            if (person.id !== viewerUserId) onOpenProfile?.(person.id)
          }}
          className="shrink-0 rounded-full ring-2 ring-emerald-400/70 ring-offset-1 focus-visible:outline-none"
        >
          <Face person={person} size={28} />
        </button>
      ))}
    </div>
  )
}

const FIELD_CLASS = 'mt-1 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[0.92rem] text-slate-900 outline-none placeholder:text-gray-400 focus:border-gray-300 focus:bg-white'

function HostSettings({ info, locale, onSaved }: { info: OpenRoomInfo; locale: string; onSaved: (info: OpenRoomInfo) => void }) {
  const copy = useMemo(() => openRoomsCopy(locale), [locale])
  const [topic, setTopic] = useState(info.topic ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const passwordOk = readOpenRoomPassword(password).kind !== 'invalid'

  const save = useCallback(async (change: { topic?: string; password?: string | null }) => {
    if (busy) return
    setBusy(true)
    setNote(null)
    try {
      const response = await fetch(buildClientApiPath(`/conversations/${encodeURIComponent(info.id)}/open-room`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(change),
      })
      const next = response.ok ? parseOpenRoomInfo(await response.json().catch(() => null)) : null
      if (next) {
        onSaved(next)
        setPassword('')
        setNote({ ok: true, text: copy.saved })
      } else {
        setNote({ ok: false, text: copy.saveFailed })
      }
    } catch {
      setNote({ ok: false, text: copy.saveFailed })
    }
    setBusy(false)
  }, [busy, copy.saveFailed, copy.saved, info.id, onSaved])

  return (
    <form
      data-qa="open-room-host-settings"
      className="mt-3 rounded-xl bg-gray-50 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!passwordOk) return
        void save({ topic, ...(password ? { password } : {}) })
      }}
    >
      <label className="block text-[0.8rem] font-semibold text-gray-600">
        {copy.topicLabel}
        <input
          type="text"
          value={topic}
          maxLength={OPEN_ROOM_TOPIC_MAX}
          placeholder={copy.topicPlaceholder}
          onChange={(event) => setTopic(event.target.value)}
          className={`${FIELD_CLASS} bg-white`}
          data-qa="open-room-host-topic"
        />
      </label>
      <label className="mt-2.5 block text-[0.8rem] font-semibold text-gray-600">
        {copy.newPassword}
        <input
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={password}
          maxLength={OPEN_ROOM_PASSWORD_MAX}
          placeholder={copy.passwordPlaceholder}
          onChange={(event) => setPassword(event.target.value)}
          className={`${FIELD_CLASS} bg-white`}
          data-qa="open-room-host-password"
        />
      </label>
      {info.hasPassword ? (
        <p className="mt-1.5 flex items-center justify-between gap-2 text-[0.78rem] text-gray-500">
          <span className="flex items-center gap-1"><Lock size={12} strokeWidth={2.4} aria-hidden="true" />{copy.passwordOn}</span>
          <button
            type="button"
            data-qa="open-room-host-remove-password"
            disabled={busy}
            onClick={() => void save({ password: null })}
            className="shrink-0 font-semibold text-rose-600 disabled:opacity-50"
          >
            {copy.removePassword}
          </button>
        </p>
      ) : null}
      {!passwordOk ? <p className="mt-1.5 text-[0.78rem] text-red-500">{copy.passwordPlaceholder}</p> : null}
      {note ? <p className={`mt-1.5 text-[0.78rem] ${note.ok ? 'text-emerald-700' : 'text-red-500'}`} role="status">{note.text}</p> : null}
      <button
        type="submit"
        disabled={busy || !passwordOk}
        data-qa="open-room-host-save"
        className="mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-slate-950 text-[0.88rem] font-semibold text-white active:bg-slate-800 disabled:opacity-50"
      >
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : copy.save}
      </button>
    </form>
  )
}

/**
 * The open-room part of the room menu. `active` is whether the menu's first
 * screen is showing (the other-rooms list is loaded then).
 */
export function OpenRoomMenuSection({
  locale,
  info,
  active,
  shareLabel,
  leaveLabel,
  onInfoChange,
  onShare,
  onMinimize,
  onLeave,
  onOpenRoom,
}: {
  locale: string
  info: OpenRoomInfo
  active: boolean
  shareLabel: string
  leaveLabel: string
  onInfoChange: (info: OpenRoomInfo) => void
  onShare: () => void
  onMinimize: () => void
  onLeave: () => void
  /** Move to another room: one the viewer is in, or one just joined (its summary comes along). */
  onOpenRoom?: (conversationId: string, joined?: ConversationChannelSummary) => void
}) {
  const copy = useMemo(() => ({ ...liveRoomsCopy(locale), ...openRoomsCopy(locale) }), [locale])
  const reports = useMemo(() => reportCopy(locale), [locale])
  const [hostOpen, setHostOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [rooms, setRooms] = useState<OpenRoomCard[]>([])
  const [movingId, setMovingId] = useState<string | null>(null)

  useEffect(() => {
    if (!active || !onOpenRoom) return
    let cancelled = false
    void fetch(buildClientApiPath('/conversations/open-rooms'), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (!cancelled) setRooms(parseOpenRooms(body)) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [active, onOpenRoom])

  // A room that asks for a password is entered from Explore, where it can be typed.
  const others = rooms.filter((room) => room.id !== info.id && (room.isMember || !room.hasPassword))
  const joined = others.filter((room) => room.isMember)
  const recommended = others.filter((room) => !room.isMember).slice(0, 8)

  const move = useCallback(async (room: OpenRoomCard) => {
    if (!onOpenRoom || movingId) return
    if (room.isMember) {
      onOpenRoom(room.id)
      return
    }
    setMovingId(room.id)
    try {
      const response = await fetch(buildClientApiPath(`/conversations/${encodeURIComponent(room.id)}/public-join`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const body = response.ok ? await response.json().catch(() => null) as { conversation?: ConversationChannelSummary } | null : null
      if (body?.conversation?.id) onOpenRoom(room.id, body.conversation)
    } catch {
      // Stays in this room; the list is still there to try again.
    }
    setMovingId(null)
  }, [movingId, onOpenRoom])

  const action = 'flex h-14 flex-col items-center justify-center gap-1 rounded-xl bg-gray-100 text-[0.78rem] font-semibold text-gray-800 transition-colors active:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300'
  const renderRooms = (heading: string, list: OpenRoomCard[], qa: string) => (list.length === 0 ? null : (
    <div className="mt-3" data-qa={qa}>
      <p className="pb-1.5 text-[0.75rem] font-semibold uppercase tracking-wide text-gray-500">{heading}</p>
      <ul className="space-y-1.5">
        {list.map((room) => {
          const status = openRoomStatus(room)
          return (
            <li key={room.id}>
              <button
                type="button"
                data-qa="open-room-move"
                disabled={movingId !== null}
                onClick={() => void move(room)}
                className="flex w-full items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-left transition-colors active:bg-gray-50 disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9rem] font-semibold text-slate-900">{room.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[0.72rem] text-gray-500">
                    {room.languages.slice(0, 3).map((language) => (
                      <LanguageFlag key={language} language={language} className="text-[0.75rem] leading-none" />
                    ))}
                    <span>{status === 'voice' ? copy.voiceTalk(room.voiceCallParticipantCount) : status === 'game' ? copy.hashRush : copy.statusChat}</span>
                    <span aria-hidden="true">·</span>
                    <span>{copy.members(room.memberCount)}</span>
                  </span>
                </span>
                {movingId === room.id ? <Loader2 size={15} className="shrink-0 animate-spin text-gray-400" aria-hidden="true" /> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  ))

  return (
    <div data-qa="open-room-menu" className="rounded-2xl border border-gray-200 px-3 py-3">
      <div className="grid grid-cols-3 gap-2">
        <button type="button" data-qa="open-room-share" onClick={onShare} className={action}>
          <Share size={17} strokeWidth={2.1} aria-hidden="true" />
          {shareLabel}
        </button>
        <button type="button" data-qa="open-room-minimize" onClick={onMinimize} className={action}>
          <Minimize2 size={17} strokeWidth={2.1} aria-hidden="true" />
          {copy.minimize}
        </button>
        <button type="button" data-qa="open-room-leave" onClick={onLeave} className={`${action} text-rose-600`}>
          <LogOut size={17} strokeWidth={2.1} aria-hidden="true" />
          {leaveLabel}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {info.topic ? <span className="min-w-0 truncate rounded-full bg-amber-50 px-2 py-0.5 text-[0.75rem] font-semibold text-amber-800">#{info.topic}</span> : null}
          {info.hasPassword ? <Lock size={13} strokeWidth={2.4} className="shrink-0 text-gray-400" aria-label={copy.passwordOn} /> : null}
        </span>
        {info.isHost ? (
          <button
            type="button"
            data-qa="open-room-host-settings-toggle"
            aria-expanded={hostOpen}
            onClick={() => setHostOpen((open) => !open)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[0.78rem] font-semibold text-gray-800 active:bg-gray-200"
          >
            <Settings2 size={13} strokeWidth={2.2} aria-hidden="true" />
            {copy.hostSettings}
          </button>
        ) : (
          <button
            type="button"
            data-qa="open-room-report"
            onClick={() => setReportOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[0.78rem] font-semibold text-gray-700 active:bg-gray-200"
          >
            <Flag size={13} strokeWidth={2.2} aria-hidden="true" />
            {reports.reportTitleRoom}
          </button>
        )}
      </div>
      {info.isHost && hostOpen ? <HostSettings info={info} locale={locale} onSaved={onInfoChange} /> : null}

      {renderRooms(copy.joinedHeading, joined, 'open-room-menu-joined')}
      {renderRooms(copy.recommended, recommended, 'open-room-menu-recommended')}

      <ReportSheet open={reportOpen} target={{ type: 'room', conversationId: info.id }} locale={locale} onClose={() => setReportOpen(false)} />
    </div>
  )
}
