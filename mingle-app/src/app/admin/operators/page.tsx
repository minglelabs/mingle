import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Search, UserRound } from 'lucide-react'
import { requireAdmin } from '@/server/admin/guard'
import { listOperatorAccounts, normalizeOperatorSearch } from '@/server/operators/operator-admin-query'
import { InactiveChip, OperatorAvatar, OperatorChip, OperatorsMain } from './_components/operator-ui'
import { countryLabel, koreanLanguageName } from './_lib/options'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '운영 계정 · Mingle Admin',
  robots: { index: false, follow: false },
}

type OperatorsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value
  return Array.isArray(value) ? value[0] ?? '' : ''
}

function listHref(query: string, page: number): string {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (page > 1) params.set('page', String(page))
  const search = params.toString()
  return search ? `/admin/operators?${search}` : '/admin/operators'
}

export default async function OperatorsPage({ searchParams }: OperatorsPageProps) {
  await requireAdmin('/admin/operators')
  const params = await searchParams
  const query = normalizeOperatorSearch(takeFirst(params.q))
  const requestedPage = Number.parseInt(takeFirst(params.page), 10) || 1

  const list = await listOperatorAccounts({ query, page: requestedPage })
  const pageButton = 'inline-flex h-11 items-center justify-center gap-1 rounded-xl border px-4 text-sm font-semibold'

  return (
    <OperatorsMain>
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">운영 계정</h1>
          <p className="mt-0.5 break-words text-sm text-slate-500">Mingle 팀이 운영하는 계정 {list.total}개</p>
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
        <label htmlFor="operator-search" className="sr-only">이름이나 핸들로 검색</label>
        <input
          id="operator-search"
          name="q"
          type="search"
          defaultValue={list.query}
          placeholder="이름이나 @핸들 검색"
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

      {list.query ? (
        <p className="mt-3 break-words text-sm text-slate-600">
          “{list.query}” 검색 결과 {list.total}개 ·{' '}
          <Link href="/admin/operators" className="font-semibold text-sky-700 underline underline-offset-2">전체 보기</Link>
        </p>
      ) : null}

      {list.items.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
          <UserRound className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-base font-semibold text-slate-800">
            {list.query ? '검색 결과가 없습니다' : '아직 운영 계정이 없습니다'}
          </p>
          <p className="mt-1 break-words text-sm text-slate-500">
            {list.query ? '다른 이름이나 핸들로 찾아보세요.' : '새 계정 만들기에서 여러 계정을 한 번에 만들 수 있습니다.'}
          </p>
        </section>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {list.items.map(item => (
            <li key={item.id}>
              <Link
                href={`/admin/operators/${encodeURIComponent(item.id)}`}
                className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:bg-slate-50"
              >
                <OperatorAvatar image={item.image} name={item.name} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-slate-900">{item.name || '이름 없음'}</span>
                    <OperatorChip />
                    {!item.isActive ? <InactiveChip /> : null}
                  </span>
                  <span className="mt-0.5 block break-all text-sm text-slate-500">@{item.handle}</span>
                  <span className="mt-0.5 block break-words text-xs text-slate-500">
                    {countryLabel(item.personaCountry)} · {koreanLanguageName(item.primaryLanguage)}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {list.pageCount > 1 ? (
        <nav className="mt-5 flex items-center justify-between gap-3" aria-label="페이지">
          {list.page > 1 ? (
            <Link href={listHref(list.query, list.page - 1)} className={`${pageButton} border-slate-300 bg-white text-slate-700`}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />이전
            </Link>
          ) : (
            <span aria-disabled="true" className={`${pageButton} border-slate-200 bg-slate-100 text-slate-400`}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />이전
            </span>
          )}
          <span className="text-sm text-slate-600">{list.page} / {list.pageCount}</span>
          {list.page < list.pageCount ? (
            <Link href={listHref(list.query, list.page + 1)} className={`${pageButton} border-slate-300 bg-white text-slate-700`}>
              다음<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-disabled="true" className={`${pageButton} border-slate-200 bg-slate-100 text-slate-400`}>
              다음<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        </nav>
      ) : null}
    </OperatorsMain>
  )
}
