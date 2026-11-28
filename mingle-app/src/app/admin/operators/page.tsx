import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Search, UserRound } from 'lucide-react'
import { requireAdmin } from '@/server/admin/guard'
import { listOperatorAccounts, normalizeOperatorSearch, parseAccountListScope, type AccountListScope } from '@/server/operators/operator-admin-query'
import { OperatorsMain } from './_components/operator-ui'
import { AccountItems, listHref } from './account-items'
import { AccountsMore } from './accounts-more'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '계정 · HashChat Admin',
  robots: { index: false, follow: false },
}

type OperatorsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value
  return Array.isArray(value) ? value[0] ?? '' : ''
}

const SCOPE_LABEL: Record<AccountListScope, string> = { all: '전체', operator: '운영 계정', live: '올라간 계정', review: '검토 중', user: '실제 유저' }


export default async function OperatorsPage({ searchParams }: OperatorsPageProps) {
  await requireAdmin('/admin/operators')
  const params = await searchParams
  const query = normalizeOperatorSearch(takeFirst(params.q))
  const requestedPage = Number.parseInt(takeFirst(params.page), 10) || 1
  const scope = parseAccountListScope(takeFirst(params.who))

  const list = await listOperatorAccounts({ query, page: requestedPage, scope })

  return (
    <OperatorsMain>
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">계정</h1>
          <p className="mt-0.5 break-words text-sm text-slate-500">{SCOPE_LABEL[scope]} {list.total}개</p>
        </div>
        <Link
          href="/admin/operators/new"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm active:bg-sky-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          새 계정
        </Link>
      </header>

      <form action="/admin/operators" method="get" role="search" className="mt-4 flex gap-2">
        {scope !== 'all' ? <input type="hidden" name="who" value={scope} /> : null}
        <label htmlFor="operator-search" className="sr-only">이름이나 핸들로 검색</label>
        <input
          id="operator-search"
          name="q"
          type="search"
          defaultValue={list.query}
          placeholder="이름, @핸들, 이메일 검색"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
        <button
          type="submit"
          aria-label="검색"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 active:bg-slate-100"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {(['all', 'operator', 'live', 'review', 'user'] as const).map((value) => (
          <Link
            key={value}
            href={listHref(list.query, 1, value)}
            aria-current={scope === value ? 'page' : undefined}
            className={`inline-flex min-h-9 items-center rounded-full px-3 font-semibold ${scope === value ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
          >
            {SCOPE_LABEL[value]}
          </Link>
        ))}
      </div>

      {list.query ? (
        <p className="mt-3 break-words text-sm text-slate-600">
          “{list.query}” 검색 결과 {list.total}개 ·{' '}
          <Link href={listHref('', 1, scope)} className="font-semibold text-sky-700 underline underline-offset-2">전체 보기</Link>
        </p>
      ) : null}

      {list.items.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
          <UserRound className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-base font-semibold text-slate-800">
            {list.query ? '검색 결과가 없습니다' : '아직 계정이 없습니다'}
          </p>
          <p className="mt-1 break-words text-sm text-slate-500">
            {list.query ? '다른 이름이나 핸들로 찾아보세요.' : '새 계정 만들기에서 여러 계정을 한 번에 만들 수 있습니다.'}
          </p>
        </section>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            <AccountItems items={list.items} back={listHref(list.query, list.page, scope)} />
          </ul>
          <AccountsMore query={list.query} scope={scope} initialCursor={list.page < list.pageCount ? String(list.page + 1) : null} />
        </>
      )}

    </OperatorsMain>
  )
}
