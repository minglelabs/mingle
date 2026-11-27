'use client'

import { useEffect, useState } from 'react'
import { CompactLanguageLevels } from '@/components/profile-language-levels'
import ProfileNationalityBadge from '@/components/profile-nationality-badge'
import { buildClientApiPath } from '@/lib/api-contract'
import { sanitizeInterestLanguages, type InterestLanguage } from '@/lib/interest-languages'
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
  author,
}: {
  locale: string
  headline: string
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
          <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-[18px] font-bold text-secondary-foreground">
            {displayName.replace(/^@/, '').charAt(0).toUpperCase()}
          </span>
        )}
        <ProfileNationalityBadge country={resolveNationalityCountry(facts?.nationality ?? null, facts?.primary)} size={56} badgeSize={22} />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[18px] font-bold leading-tight text-slate-950">{headline}</span>
        {facts ? (
          <CompactLanguageLevels primaryLanguages={facts.primary} interestLanguages={facts.interest} locale={locale} textClass="text-slate-900" mutedClass="text-slate-300" />
        ) : null}
      </span>
    </div>
  )
}
