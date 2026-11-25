import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { AccountListScope, OperatorListItem } from '@/server/operators/operator-admin-query'
import { adminProfileHref } from '../_lib/profile-href'
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

/** One page of the accounts tab's list (the first on the page, the rest appended as staff scroll). */
export function AccountItems({ items, back }: { items: OperatorListItem[]; back: string }) {
  return (
    <>
      {items.map(item => (
        <li key={item.id}>
          <Link
            href={item.isOperator ? `/admin/operators/${encodeURIComponent(item.id)}` : adminProfileHref(item.id, back)}
            className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:bg-slate-50"
          >
            <OperatorAvatar image={item.image} name={item.name} size={48} languages={item.primaryLanguage ? [item.primaryLanguage] : []} />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold text-slate-900">{item.name || '이름 없음'}</span>
                {item.isOperator ? <OperatorChip /> : null}
                {item.isOperator && !item.isActive ? <InactiveChip /> : null}
              </span>
              <span className="mt-0.5 block break-all text-sm text-slate-500">@{item.handle}</span>
              <span className="mt-0.5 block break-words text-xs text-slate-500">
                {countryLabel(item.personaCountry)}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </>
  )
}
