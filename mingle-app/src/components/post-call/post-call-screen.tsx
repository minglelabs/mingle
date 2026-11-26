'use client'

import { ArrowUp, ChevronDown, ImagePlus, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import DuoCallStage, { DuoCallSelfFace, type DuoCallPhase } from '@/components/LivePhoneDemo/DuoCallStage'
import SlideSurface from '@/components/slide-surface'
import { resolveConversationImageCopy } from '@/i18n/conversation-image-copy'
import { resolveLivePhoneDemoComposerCopy } from '@/i18n/live-phone-demo-composer-copy'
import { openRoomsCopy } from '@/i18n/open-rooms-copy'
import { resolvePostCallCopy } from '@/i18n/post-call-copy'
import { voiceTalkCopy } from '@/i18n/voice-talk-copy'
import { minimizePostCall } from '@/lib/post-call-session'
import type { PostCallSession, PostCallTimelineLine } from './use-post-call-session'

/** The viewer's own face in the bar (larger than the buttons beside it). */
const SELF_FACE_PX = 40
const CONTROL_PX = 38
const TEXT_MAX_PX = 112

/**
 * The call screen of a 1:1 voice talk from a post (owner, 2026-11-26): over
 * whatever tab is on screen, never a chat room. The other person's photo,
 * blurred, is the whole screen; their face sits a third of the way down with
 * the call's buttons under it; what is said and written runs under those; at
 * the bottom one dark glass bar holds the viewer's face (rippling while they
 * speak), a photo button, the text box and send. Typing folds the face and
 * the photo button away so the text box takes the bar.
 *
 * The back gesture (iOS edge swipe, Android back) and the chevron fold the
 * screen into the bubble; the call goes on.
 */
export default function PostCallScreen({ session, open, locale, viewerImage, viewerName }: {
  session: PostCallSession
  open: boolean
  locale: string
  viewerImage: string | null
  viewerName: string | null
}) {
  const copy = useMemo(() => resolvePostCallCopy(locale), [locale])
  const composerCopy = useMemo(() => resolveLivePhoneDemoComposerCopy(locale), [locale])
  const imageCopy = useMemo(() => resolveConversationImageCopy(locale), [locale])
  const minimizeLabel = openRoomsCopy(locale).minimize
  const micMuted = voiceTalkCopy(locale).micMuted
  const { call, status } = session

  const phase: DuoCallPhase = session.over
    ? 'over'
    : status === 'ringing'
      ? (call.role === 'author' ? 'ringing_in' : 'ringing_out')
      : session.talking ? 'talking' : 'connecting'
  const showsLines = status === 'accepted' && !session.over

  // ---- the text box ----
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [sending, setSending] = useState(false)
  const resize = useCallback(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(TEXT_MAX_PX, Math.max(22, element.scrollHeight))}px`
  }, [])
  useLayoutEffect(resize, [draft, resize])
  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setDraft('')
    const ok = await session.sendText(text)
    setSending(false)
    if (!ok) toast(copy.unavailable)
    textareaRef.current?.focus()
  }, [copy.unavailable, draft, sending, session])

  // ---- photo ----
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const onPhoto = useCallback(async (file: File | null) => {
    if (!file) return
    setUploading(true)
    const ok = await session.sendPhoto(file)
    setUploading(false)
    if (!ok) toast(imageCopy.error)
  }, [imageCopy.error, session])

  const hasLines = session.timeline.length > 0
  // ---- where the lines start: under the face and the buttons ----
  const rootRef = useRef<HTMLDivElement | null>(null)
  const blockRef = useRef<HTMLDivElement | null>(null)
  // The lines live in the space between the top row and the bar (in the
  // layout, so the bar never covers them); they start under the buttons.
  const linesAreaRef = useRef<HTMLDivElement | null>(null)
  const [linesTop, setLinesTop] = useState(0)
  useEffect(() => {
    const block = blockRef.current
    const root = rootRef.current
    if (!block || !root) return
    const measure = () => {
      const area = linesAreaRef.current
      if (!area) return
      setLinesTop(Math.max(0, Math.round(block.getBoundingClientRect().bottom - area.getBoundingClientRect().top)))
    }
    measure()
    const settled = window.setTimeout(measure, 360)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(block)
    observer?.observe(root)
    if (linesAreaRef.current) observer?.observe(linesAreaRef.current)
    return () => {
      window.clearTimeout(settled)
      observer?.disconnect()
    }
  }, [phase, session.interpretOn, hasLines])

  // New lines scroll into view.
  const listRef = useRef<HTMLDivElement | null>(null)
  const lastLine = session.timeline[session.timeline.length - 1]
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [lastLine?.id, lastLine?.text, lastLine?.translation])

  const compact = session.interpretOn || session.timeline.length > 0

  return (
    <SlideSurface
      open={open}
      onClose={minimizePostCall}
      ariaLabel={copy.category}
      zIndex={135}
      nativeBackPriority={135}
      className="keyboard-safe fixed inset-0 z-[135] flex min-h-0 w-full flex-col overflow-hidden bg-slate-900 text-white"
    >
      <div ref={rootRef} className="relative flex min-h-0 flex-1 flex-col" data-qa="post-call-screen" data-post-call-phase={phase}>
        <DuoCallStage
          locale={locale}
          labels={{
            waiting: copy.waiting,
            incoming: copy.incoming,
            accept: copy.accept,
            decline: copy.decline,
            cancel: copy.cancel,
            hangUp: copy.hangUp,
            connecting: copy.connecting,
            translate: copy.translate,
            readAloud: copy.readAloud,
            mic: copy.mic,
            micMuted,
          }}
          peer={call.peer}
          phase={phase}
          secondsLeft={session.secondsLeft}
          overText={status === 'ended' ? copy.ended : copy.notConnected}
          note={null}
          peerSpeaking={session.peerSpeaking}
          peerMicOn={session.peerMicOn}
          micOn={session.micOn}
          interpretOn={session.interpretOn}
          listenOn={session.listenOn}
          earphonesConnected={false}
          busy={session.busy}
          onAccept={session.accept}
          onHangUp={session.hangUp}
          onToggleMic={session.toggleMic}
          onToggleInterpret={session.toggleInterpret}
          onToggleListen={session.toggleListen}
          compact={compact}
          blockRef={blockRef}
        />

        {/* Top: fold into the bubble. */}
        <div className="relative z-40 flex shrink-0 items-center px-3" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(54px + env(safe-area-inset-top, 0px))' }}>
          <button
            type="button"
            data-qa="post-call-minimize"
            aria-label={minimizeLabel}
            onClick={minimizePostCall}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition active:scale-95"
          >
            <ChevronDown size={24} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        {/* What is said and written, under the face and the buttons. */}
        <div ref={linesAreaRef} className="relative z-20 min-h-0 flex-1">
          {showsLines ? (
            <div
              ref={listRef}
              data-qa="post-call-lines"
              className="absolute inset-x-0 bottom-0 overflow-y-auto overscroll-contain px-3 pb-2 pt-4"
              style={{
                top: linesTop,
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 20px)',
                maskImage: 'linear-gradient(to bottom, transparent 0, #000 20px)',
              }}
            >
              <div className="flex min-h-full flex-col justify-end gap-2">
                {session.timeline.map((line) => <Line key={line.id} line={line} />)}
              </div>
            </div>
          ) : null}
        </div>

        {/* The bottom bar: one dark glass bar. */}
        {showsLines ? (
          <div className="relative z-40 shrink-0 px-3 pt-2" style={{ paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 8px), 12px)' }}>
            <div
              data-qa="post-call-bar"
              className="flex items-end gap-1.5 rounded-[26px] bg-slate-950/55 p-1.5 shadow-[0_10px_30px_rgba(2,6,23,0.35)] ring-1 ring-white/12 backdrop-blur-xl"
            >
              <div
                className={`flex shrink-0 items-end gap-1.5 transition-[max-width,opacity,margin] duration-200 ease-out ${
                  focused ? 'pointer-events-none -mr-1.5 max-w-0 overflow-hidden opacity-0' : 'max-w-[100px] opacity-100'
                }`}
                aria-hidden={focused || undefined}
              >
                <DuoCallSelfFace image={viewerImage} name={viewerName} speaking={session.selfSpeaking} micOn={session.micOn} sizePx={SELF_FACE_PX} />
                <button
                  type="button"
                  data-qa="post-call-photo"
                  aria-label={imageCopy.choose}
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/14 text-white transition active:scale-95 disabled:opacity-60"
                  style={{ width: CONTROL_PX, height: CONTROL_PX }}
                >
                  {uploading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={19} strokeWidth={2.2} aria-hidden="true" />}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null
                    event.target.value = ''
                    void onPhoto(file)
                  }}
                />
              </div>
              <div className="flex min-h-[38px] min-w-0 flex-1 items-center rounded-[19px] bg-white/10 px-3.5">
                <textarea
                  ref={textareaRef}
                  data-qa="post-call-text"
                  rows={1}
                  value={draft}
                  placeholder={composerCopy.composerPlaceholder}
                  onChange={(event) => setDraft(event.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  className="block w-full resize-none bg-transparent py-2 text-[16px] leading-[22px] text-white outline-none placeholder:text-white/45"
                />
              </div>
              <button
                type="button"
                data-qa="post-call-send"
                aria-label={composerCopy.sendMessageLabel}
                disabled={!draft.trim() || sending}
                // Keep the keyboard up while sending.
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => void send()}
                className={`inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
                  draft.trim() ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_4px_12px_rgba(249,115,22,0.45)]' : 'bg-white/14 text-white/50'
                }`}
                style={{ width: CONTROL_PX, height: CONTROL_PX }}
              >
                <ArrowUp size={19} strokeWidth={2.6} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <div className="shrink-0" style={{ height: 'max(env(safe-area-inset-bottom, 0px), 12px)' }} />
        )}
      </div>
    </SlideSurface>
  )
}

function Line({ line }: { line: PostCallTimelineLine }) {
  return (
    <div className={`flex ${line.mine ? 'justify-end' : 'justify-start'}`} data-qa="post-call-line" data-mine={line.mine ? '1' : '0'}>
      <div
        className={`max-w-[80%] overflow-hidden rounded-[20px] text-[15px] leading-snug shadow-[0_4px_14px_rgba(2,6,23,0.18)] ${
          line.mine ? 'rounded-br-md bg-amber-300 text-slate-950' : 'rounded-bl-md bg-white/92 text-slate-900'
        } ${line.partial ? 'opacity-75' : ''}`}
      >
        {line.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.imageUrl} alt="" className="block max-h-64 w-full object-cover" />
        ) : (
          <div className="px-3.5 py-2.5">
            <p className="whitespace-pre-wrap break-words">{line.text}</p>
            {line.translation ? (
              <p className={`mt-1 whitespace-pre-wrap break-words text-[14px] ${line.mine ? 'text-amber-900/70' : 'text-slate-500'}`}>{line.translation}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
