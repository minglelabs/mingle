import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { CompactLanguageLevels } from '@/components/profile-language-levels'
import type { AccountListScope, OperatorListItem } from '@/server/operators/operator-admin-query'
import { adminProfileHref } from '../_lib/profile-href'
import { PhotoEngineBadge } from '../_components/photo-engine-badge'
import { ZoomableImage } from '../feed/_components/zoomable-image'
import { InactiveChip, OperatorAvatar, OperatorChip } from './_components/operator-ui'
import { countryLabel } from './_lib/options'

export function listHref(query: string, page: number, scope: AccountListScope = 'all'): string {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (scope !== 'all') params.set('who', scope)
  if (page > 1) params.set('page', String(page))
  const search = params.toString()
  return search ? `/admin/operators?${search}` : '/admin/operators'
}

const GENDER: Record<string, string> = { female: '여', male: '남' }

/**
 * One page of the accounts tab's list (the first on the page, the rest
 * appended as staff scroll): each account as a big card, as on the review
 * and feed tabs (staff, 2026-11-25), so staff look through them by scrolling.
 */
export function AccountItems({ items, back }: { items: OperatorListItem[]; back: string }) {
  return (
    <>
      {items.map(item => {
        const href = item.isOperator ? `/admin/operators/${encodeURIComponent(item.id)}` : adminProfileHref(item.id, back)
        const facts = [
          countryLabel(item.personaCountry),
          item.city,
          item.age != null ? `${item.age}세` : null,
          item.gender ? GENDER[item.gender] ?? null : null,
          `글 ${item.postCount}개`,
        ].filter(Boolean).join(' · ')
        return (
          <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <Link href={href} className="flex items-center gap-3 active:opacity-70">
              <OperatorAvatar image={item.image} name={item.name} size={40} languages={item.primaryLanguage ? [item.primaryLanguage] : []} />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold text-slate-900">{item.name || '이름 없음'}</span>
                  {item.isOperator ? <OperatorChip /> : null}
                  {item.isOperator && !item.isActive ? <InactiveChip /> : null}
                </span>
                <span className="block truncate text-sm text-slate-500">@{item.handle}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
            </Link>

            {item.image ? (
              <div className="relative mt-3">
                <ZoomableImage
                  src={item.image}
                  alt={`${item.name || item.handle} 프사`}
                  width={1000}
                  height={1000}
                  loading="lazy"
                  decoding="async"
                  className="aspect-square max-h-[75svh] w-full rounded-xl bg-slate-100 object-cover"
                />
                {item.isOperator ? <PhotoEngineBadge id={item.image} /> : null}
              </div>
            ) : null}

            <p className="mt-3 text-xs text-slate-500">{facts}</p>
            <CompactLanguageLevels primaryLanguages={item.primaryLanguages} interestLanguages={item.interestLanguages} locale="ko" className="mt-1" />
            {item.bio ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{item.bio}</p> : null}
          </li>
        )
      })}
    </>
  )
}
