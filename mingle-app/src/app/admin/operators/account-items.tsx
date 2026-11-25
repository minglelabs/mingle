import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { CompactLanguageLevels } from '@/components/profile-language-levels'
import type { AccountListScope, OperatorListItem } from '@/server/operators/operator-admin-query'
import { adminProfileHref } from '../_lib/profile-href'
import { PhotoEngineBadge } from '../_components/photo-engine-badge'
import { ZoomableImage } from '../feed/_components/zoomable-image'
import { InactiveChip, OperatorAvatar, OperatorChip } from './_components/operator-ui'
import { countryLabel } from './_lib/options'
import { AccountTakedownButton } from './account-takedown-button'

export function listHref(query: string, page: number, scope: AccountListScope = 'all'): string {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (scope !== 'all') params.set('who', scope)
  if (page > 1) params.set('page', String(page))
  const search = params.toString()
  return search ? `/admin/operators?${search}` : '/admin/operators'
}

const GENDER: Record<string, string> = { female: '여', male: '남' }

/** "2026-11-25 17:20" in Korean time. */
function koreanTime(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60_000).toISOString().slice(0, 16).replace('T', ' ')
}

/** How long ago, as on the feed tab. */
function relativeTime(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}시간 전`
  return `${Math.floor(minutes / (24 * 60))}일 전`
}

/**
 * One page of the accounts tab's list (the first on the page, the rest
 * appended as staff scroll): each account as a card to read through, as on
 * the review and feed tabs (staff, 2026-11-25), with when it was made and
 * 내리고 검토로 for an operator account.
 */
export function AccountItems({ items, back }: { items: OperatorListItem[]; back: string }) {
  const now = new Date()
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
            {item.image ? (
              <div className="relative mb-3 w-2/3 max-w-[320px]">
                <ZoomableImage
                  src={item.image}
                  alt={`${item.name || item.handle} 프사`}
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full rounded-xl bg-slate-100 object-cover"
                />
                {item.isOperator ? <PhotoEngineBadge id={item.image} className="absolute bottom-2 left-2 z-[1]" /> : null}
              </div>
            ) : (
              <div className="mb-3">
                <OperatorAvatar image={null} name={item.name} size={112} />
              </div>
            )}
            <Link href={href} className="block min-w-0 active:opacity-70">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold text-slate-900">{item.name || '이름 없음'}</span>
                {item.isOperator ? <OperatorChip /> : null}
                {item.isOperator && !item.isActive ? <InactiveChip /> : null}
                <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              </span>
              <span className="block truncate text-sm text-slate-500">@{item.handle}</span>
              <span className="mt-1 block text-xs text-slate-500">{facts}</span>
              <span className="mt-0.5 block text-xs text-slate-500">만든 시각 {koreanTime(item.createdAt)} · {relativeTime(item.createdAt, now)}</span>
              <CompactLanguageLevels primaryLanguages={item.primaryLanguages} interestLanguages={item.interestLanguages} locale="ko" className="mt-1" />
            </Link>
            {item.bio ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{item.bio}</p> : null}
            {item.isOperator ? (
              <div className="mt-3">
                <AccountTakedownButton userId={item.id} live={item.reviewState === 'approved' && item.isActive} />
              </div>
            ) : null}
          </li>
        )
      })}
    </>
  )
}
