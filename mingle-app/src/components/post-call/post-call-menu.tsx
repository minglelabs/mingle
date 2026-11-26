'use client'

import { Ban, Check, ChevronLeft, ChevronRight, Flag, Languages, Menu, PhoneOff, Search, Type, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import LanguageFlag from '@/components/language-flag'
import { buildLanguageSelectorItems, filterLanguageSelectorItems, partitionLanguageSelectorItemsByPriority, sortLanguageSelectorItems } from '@/components/LivePhoneDemo/language-selector.logic'
import ReportSheet from '@/components/reports/report-sheet'
import SlideSurface from '@/components/slide-surface'
import { resolvePostCallCopy } from '@/i18n/post-call-copy'
import { resolvePostCallMenuCopy } from '@/i18n/post-call-menu-copy'
import { buildClientApiPath } from '@/lib/api-contract'
import { minimizePostCall } from '@/lib/post-call-session'
import type { PostCallSession } from './use-post-call-session'

export type PostCallTextSize = 'small' | 'medium' | 'large'

/** Above the call screen (135) and its bubble (140). */
const SHEET_Z = 150

const subscribeNever = () => () => {}

function base(language: string): string {
  return language.trim().toLowerCase().split(/[-_]/)[0] ?? ''
}

/**
 * The top right of the 1:1 voice talk screen (owner, 2026-11-26), as in a
 * chat room: the language the viewer hears the other person in (their first
 * comfortable language unless they pick another) and a menu of what can be
 * changed during the call.
 */
export function PostCallTopActions({ session, locale, comfortable, textSize, onTextSize }: {
  session: PostCallSession
  locale: string
  comfortable: readonly string[]
  textSize: PostCallTextSize
  onTextSize: (size: PostCallTextSize) => void
}) {
  const copy = useMemo(() => resolvePostCallMenuCopy(locale), [locale])
  const [languageOpen, setLanguageOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const callCopy = useMemo(() => resolvePostCallCopy(locale), [locale])
  const router = useRouter()
  const peer = session.call.peer
  const shown = session.status === 'accepted' && !session.over
  const onClient = useSyncExternalStore(subscribeNever, () => true, () => false)

  const pick = useCallback((language: string) => {
    session.pickLanguage(language)
    setLanguageOpen(false)
  }, [session])

  const viewProfile = useCallback(() => {
    setMenuOpen(false)
    minimizePostCall()
    router.push(`/${locale}/users/${encodeURIComponent(peer.userId)}`)
  }, [locale, peer.userId, router])

  const [blocking, setBlocking] = useState(false)
  const block = useCallback(async () => {
    if (blocking) return
    setBlocking(true)
    const response = await fetch(buildClientApiPath(`/users/${encodeURIComponent(peer.userId)}/block`), { method: 'POST' }).catch(() => null)
    setBlocking(false)
    if (!response?.ok) {
      toast(copy.blockFailed)
      return
    }
    setMenuOpen(false)
    session.hangUp()
  }, [blocking, copy.blockFailed, peer.userId, session])

  if (!shown) return null
  return (
    <>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          data-qa="post-call-language"
          aria-label={copy.language}
          onClick={() => setLanguageOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/15 pl-2 pr-3 text-[13px] font-semibold uppercase text-white backdrop-blur-md transition active:scale-95"
        >
          <LanguageFlag language={session.hearLanguage} className="h-5 w-5 rounded-full" />
          <span>{session.hearLanguage}</span>
        </button>
        <button
          type="button"
          data-qa="post-call-menu"
          aria-label={copy.menu}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition active:scale-95"
        >
          <Menu size={19} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      {/* On the page itself: inside the call screen's top row they would sit under its bar. */}
      {onClient ? createPortal(<>
      <LanguagePage
        open={languageOpen}
        locale={locale}
        comfortable={comfortable}
        selected={session.hearLanguage}
        onPick={pick}
        onClose={() => setLanguageOpen(false)}
      />

      <SlideSurface
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        ariaLabel={copy.menu}
        zIndex={SHEET_Z}
        nativeBackPriority={SHEET_Z}
        className="fixed inset-0 flex min-h-0 w-full flex-col bg-white text-gray-900"
      >
        <PageHeader title={copy.menu} backLabel={copy.close} onBack={() => setMenuOpen(false)} />
        <div data-qa="post-call-menu-panel" className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-2">
          <div className="overflow-hidden rounded-2xl border border-gray-200">
            <button
              type="button"
              data-qa="post-call-menu-language"
              onClick={() => setLanguageOpen(true)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50"
            >
              <Languages size={20} className="text-gray-500" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[0.98rem] font-medium">{copy.language}</span>
              <span className="inline-flex items-center gap-1.5 text-[0.9rem] uppercase text-gray-500">
                <LanguageFlag language={session.hearLanguage} className="h-4 w-4 rounded-full" />
                {session.hearLanguage}
              </span>
              <ChevronRight size={18} className="text-gray-400" aria-hidden="true" />
            </button>
            <div className="border-t border-gray-100 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Type size={20} className="text-gray-500" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-[0.98rem] font-medium">{copy.textSize}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label={copy.textSize}>
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="radio"
                    aria-checked={textSize === size}
                    data-qa={`post-call-text-size-${size}`}
                    onClick={() => onTextSize(size)}
                    className={`rounded-lg py-2 font-medium transition ${textSize === size ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'} ${size === 'small' ? 'text-[13px]' : size === 'medium' ? 'text-[15px]' : 'text-[17px]'}`}
                  >
                    {copy[size]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
            <MenuRow qa="post-call-menu-profile" icon={<UserRound size={20} aria-hidden="true" />} label={copy.profile} onClick={viewProfile} />
            <MenuRow qa="post-call-menu-report" icon={<Flag size={20} aria-hidden="true" />} label={copy.report} onClick={() => setReportOpen(true)} />
            <MenuRow qa="post-call-menu-block" icon={<Ban size={20} aria-hidden="true" />} label={copy.block} tone="danger" disabled={blocking} onClick={() => { void block() }} />
          </div>

          <button
            type="button"
            data-qa="post-call-menu-hangup"
            onClick={() => { setMenuOpen(false); session.hangUp() }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 px-4 py-3.5 text-[0.98rem] font-semibold text-white active:bg-rose-600"
          >
            <PhoneOff size={19} aria-hidden="true" />
            {callCopy.hangUp}
          </button>
        </div>
      </SlideSurface>

      <ReportSheet open={reportOpen} target={{ type: 'user', userId: peer.userId }} locale={locale} onClose={() => setReportOpen(false)} zIndex={SHEET_Z + 5} />
      </>, document.body) : null}
    </>
  )
}

function PageHeader({ title, backLabel, onBack }: { title: string; backLabel: string; onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-2" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(54px + env(safe-area-inset-top, 0px))' }}>
      <button type="button" aria-label={backLabel} onClick={onBack} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-800 active:bg-gray-100">
        <ChevronLeft size={24} strokeWidth={2.2} aria-hidden="true" />
      </button>
      <h2 className="min-w-0 flex-1 truncate text-[1.05rem] font-semibold">{title}</h2>
    </div>
  )
}

function MenuRow({ qa, icon, label, onClick, tone, disabled }: { qa: string; icon: React.ReactNode; label: string; onClick: () => void; tone?: 'danger'; disabled?: boolean }) {
  return (
    <button
      type="button"
      data-qa={qa}
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3.5 text-left first:border-t-0 active:bg-gray-50 disabled:opacity-60 ${tone === 'danger' ? 'text-rose-600' : 'text-gray-900'}`}
    >
      <span className={tone === 'danger' ? 'text-rose-500' : 'text-gray-500'}>{icon}</span>
      <span className="min-w-0 flex-1 text-[0.98rem] font-medium">{label}</span>
    </button>
  )
}

/** One language, picked from the viewer's comfortable ones first, then every other. */
function LanguagePage({ open, locale, comfortable, selected, onPick, onClose }: {
  open: boolean
  locale: string
  comfortable: readonly string[]
  selected: string
  onPick: (language: string) => void
  onClose: () => void
}) {
  const copy = useMemo(() => resolvePostCallMenuCopy(locale), [locale])
  const [query, setQuery] = useState('')
  // Language names come from the browser's Intl, which the server can name
  // differently: the list is built on the phone only.
  const onClient = useSyncExternalStore(subscribeNever, () => true, () => false)
  const items = useMemo(() => (onClient ? buildLanguageSelectorItems(locale) : []), [locale, onClient])
  const mineCodes = useMemo(() => [...new Set(comfortable.map(base).filter(Boolean))], [comfortable])
  const mine = useMemo(
    () => mineCodes.map((code) => items.find((item) => base(item.code) === code)).filter((item): item is (typeof items)[number] => Boolean(item)),
    [items, mineCodes],
  )
  const rest = useMemo(() => {
    const others = filterLanguageSelectorItems(items.filter((item) => !mineCodes.includes(base(item.code))), query)
    // The most spoken first (as the room's picker), then the rest by name.
    const { priorityItems, otherItems } = partitionLanguageSelectorItemsByPriority(others)
    return [...priorityItems, ...sortLanguageSelectorItems(otherItems, 'locale', locale)]
  }, [items, locale, mineCodes, query])
  const shownMine = query.trim() ? filterLanguageSelectorItems(mine, query) : mine

  const row = (item: (typeof items)[number], isDefault: boolean) => {
    const active = base(item.code) === base(selected)
    return (
      <button
        key={item.code}
        type="button"
        data-qa="post-call-language-option"
        data-lang={item.code}
        aria-pressed={active}
        onClick={() => onPick(item.code)}
        className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-left first:border-t-0 active:bg-gray-50"
      >
        <LanguageFlag language={item.code} className="h-6 w-6 rounded-full" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.98rem] font-medium text-gray-900">{item.localizedName}</span>
          {item.nativeName !== item.localizedName ? <span className="block truncate text-[0.8rem] text-gray-500">{item.nativeName}</span> : null}
        </span>
        {isDefault ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{copy.defaultBadge}</span> : null}
        {active ? <Check size={20} strokeWidth={2.6} className="text-amber-500" aria-hidden="true" /> : null}
      </button>
    )
  }

  return (
    <SlideSurface
      open={open}
      onClose={onClose}
      ariaLabel={copy.language}
      zIndex={SHEET_Z + 2}
      nativeBackPriority={SHEET_Z + 2}
      className="fixed inset-0 flex min-h-0 w-full flex-col bg-white text-gray-900"
    >
      <PageHeader title={copy.language} backLabel={copy.close} onBack={onClose} />
      <div className="shrink-0 px-4 pb-3">
        <p className="text-[0.85rem] text-gray-500">{copy.languageHint}</p>
        <label className="mt-3 flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2.5">
          <Search size={17} className="text-gray-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.search}
            className="min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none placeholder:text-gray-400"
          />
        </label>
      </div>
      <div data-qa="post-call-language-list" className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),20px)]">
        {shownMine.length > 0 ? (
          <div className="mb-3 overflow-hidden rounded-2xl border border-gray-200">
            {shownMine.map((item, index) => row(item, index === 0 && !query.trim()))}
          </div>
        ) : null}
        <div className="overflow-hidden rounded-2xl border border-gray-200">
          {rest.map((item) => row(item, false))}
        </div>
      </div>
    </SlideSurface>
  )
}
