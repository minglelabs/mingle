'use client'

import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CompactLanguageLevels } from '@/components/profile-language-levels'
import ProfileNationalityBadge from '@/components/profile-nationality-badge'
import { buildClientApiPath } from '@/lib/api-contract'
import { sanitizeInterestLanguages, type InterestLanguage } from '@/lib/interest-languages'
import { POST_CALL_TITLE_MAX } from '@/lib/post-category'
import { resolveNationalityCountry } from '@/lib/nationality'

type CallFacts = { nationality: string | null; primary: string[]; interest: InterestLanguage[] }

/**
 * On top of a 1:1 voice talk post being written (owner, 2026-11-27): who will
 * take the calls, as people see them on the card (photo with the nationality
 * flag at its lower left, comfortable ⇄ learning languages with levels), and
 * the invitation itself, before the text.
 */
export default function ComposeCallCard({
  locale,
  headline,
  title,
  onTitleChange,
  author,
}: {
  locale: string
  /** The default title, shown until the author writes their own. */
  headline: string
  /** The post's own title ("방제", owner 2026-11-27): editable here, empty for the default. */
  title: string
  onTitleChange: (next: string) => void
  author: { name: string | null; handle: string; imageUrl: string | null }
}) {
  const [facts, setFacts] = useState<CallFacts | null>(null)
  useEffect(() => {
    let cancelled = false
    void fetch(buildClientApiPath('/profile'), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { nationalityCountry?: unknown; primaryLanguages?: unknown; interestLanguages?: unknown; interestLanguageLevels?: unknown } | null) => {
        if (cancelled || !body) return
        const primary = Array.isArray(body.primaryLanguages) ? body.primaryLanguages.filter((code): code is string => typeof code === 'string') : []
        const codes = Array.isArray(body.interestLanguages) ? body.interestLanguages : []
        const levels = Array.isArray(body.interestLanguageLevels) ? body.interestLanguageLevels : []
        setFacts({
          nationality: typeof body.nationalityCountry === 'string' ? body.nationalityCountry : null,
          primary,
          interest: sanitizeInterestLanguages(codes.map((code, index) => ({ code, level: levels[index] })), primary),
        })
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const displayName = author.name?.trim() || (author.handle ? `@${author.handle}` : '')
  return (
    <div data-qa="compose-call-card" className="mx-4 mt-1 flex items-center gap-3.5 rounded-2xl bg-amber-50 px-4 py-3.5">
      <span className="relative shrink-0">
        {author.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={author.imageUrl} alt="" className="h-14 w-14 rounded-full object-cover" draggable={false} />
        ) : (
          <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[18px] font-bold text-amber-700 shadow-sm">
            {displayName.replace(/^@/, '').charAt(0).toUpperCase()}
          </span>
        )}
        <ProfileNationalityBadge country={resolveNationalityCountry(facts?.nationality ?? null, facts?.primary)} size={56} badgeSize={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <label className="flex min-w-0 items-center gap-1.5 border-b border-dashed border-amber-300 pb-0.5">
          <span className="sr-only">{headline}</span>
          <input
            data-qa="compose-call-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value.slice(0, POST_CALL_TITLE_MAX))}
            placeholder={headline}
            enterKeyHint="done"
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
            className="min-w-0 flex-1 bg-transparent text-[18px] font-bold leading-tight text-slate-950 outline-none placeholder:text-slate-950"
            dir="auto"
          />
          <Pencil size={15} strokeWidth={2.2} className="shrink-0 text-amber-600" aria-hidden="true" />
        </label>
        {facts ? (
          <CompactLanguageLevels primaryLanguages={facts.primary} interestLanguages={facts.interest} locale={locale} textClass="text-slate-900" mutedClass="text-slate-300" />
        ) : null}
      </span>
    </div>
  )
}
