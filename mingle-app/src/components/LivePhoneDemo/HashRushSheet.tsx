'use client'

// Hash Rush inside the chat room. The game runs on the Hash Rush game server
// (one game room per chat room); this sheet slides up over the chat with the
// game page in it. The app gives an entry ticket, so only room members get in,
// under their chat name. Drag the handle down (or tap close) to go back to chat.
// A voice talk that is on keeps going while the game is open.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { Loader2, X } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'

const GAME_URL = (process.env.NEXT_PUBLIC_HASH_RUSH_URL || '').trim()
const GAME_SERVER = (process.env.NEXT_PUBLIC_HASH_RUSH_SERVER || '').trim()

export function isHashRushConfigured(): boolean {
  return !!GAME_URL && !!GAME_SERVER
}

const ko = (locale: string) => (locale || '').toLowerCase().startsWith('ko')

export function hashRushMenuLabel(locale: string): string {
  return ko(locale) ? '🌻 Hash Rush 같이 하기' : '🌻 Play Hash Rush together'
}

export function buildHashRushUrl(args: { gameUrl: string, server: string, room: string, ticket: string, name: string, lang: string }): string {
  const url = new URL(args.gameUrl)
  url.searchParams.set('server', args.server)
  url.searchParams.set('room', args.room)
  url.searchParams.set('ticket', args.ticket)
  if (args.name) url.searchParams.set('name', args.name.slice(0, 8))
  if (args.lang) url.searchParams.set('lang', args.lang)
  url.searchParams.set('embed', '1')
  return url.toString()
}

type Props = {
  open: boolean
  conversationId: string | null | undefined
  playerName: string
  uiLocale: string
  onClose: () => void
}

export default function HashRushSheet({ open, conversationId, playerName, uiLocale, onClose }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open || !conversationId || !isHashRushConfigured()) return
    let cancelled = false
    setFailed(false)
    setSrc(null)
    fetch(buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/hash-rush/ticket` as `/${string}`), {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`ticket_${response.status}`)
        const body = await response.json() as { ticket?: string, room?: string, name?: string }
        if (!body.ticket || !body.room) throw new Error('ticket_missing')
        if (cancelled) return
        setSrc(buildHashRushUrl({
          gameUrl: GAME_URL,
          server: GAME_SERVER,
          room: body.room,
          ticket: body.ticket,
          name: body.name || playerName,
          lang: (uiLocale || 'en').split('-')[0],
        }))
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [open, conversationId, playerName, uiLocale])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="hash-rush"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 360, damping: 38 }}
          className="absolute inset-x-0 bottom-0 z-[60] flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-12px_32px_rgba(15,23,42,0.18)]"
          style={{ top: 'calc(54px + env(safe-area-inset-top, 0px))' }}
          data-qa="hash-rush-sheet"
        >
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
            className="flex shrink-0 cursor-grab items-center gap-2 px-4 pb-1 pt-2"
          >
            <span className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-gray-200" />
            <span className="flex-1 pt-2 text-[0.92rem] font-semibold text-gray-900">🌻 Hash Rush</span>
            <button type="button" onClick={onClose} aria-label={ko(uiLocale) ? '채팅으로' : 'Back to chat'} className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
              <X size={18} strokeWidth={2.4} />
            </button>
          </motion.div>
          <div className="relative min-h-0 flex-1 bg-[#cfe9a8]">
            {src ? (
              <iframe
                src={src}
                title="Hash Rush"
                className="h-full w-full border-0"
                allow="autoplay; fullscreen"
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[0.9rem] text-gray-600">
                {failed
                  ? (ko(uiLocale) ? '게임에 들어가지 못했어요' : 'Could not open the game')
                  : <Loader2 size={22} className="animate-spin" />}
              </div>
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
