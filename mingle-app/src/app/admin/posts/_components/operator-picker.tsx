'use client'

import { Check, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { OperatorPostPickerEntry } from '@/server/operator-posts/types'
import { languageLabel, operatorDisplayName } from '../_lib/copy'
import { filterOperators } from '../_lib/operators'
import OperatorAvatar from './operator-avatar'

/**
 * Full-screen picker (a sheet is cramped once the iOS keyboard is up):
 * search by name, @handle or language; accounts that cannot post (retired,
 * restricted) are listed last and cannot be chosen.
 */
export default function OperatorPicker({
  operators,
  selectedId,
  title,
  onSelect,
  onClose,
}: {
  operators: readonly OperatorPostPickerEntry[]
  selectedId: string | null
  title: string
  onSelect: (operatorId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterOperators(operators, query), [operators, query])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-white text-slate-900"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-1.5">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
          aria-label="닫기"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="px-4 py-3">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 focus-within:border-sky-500 focus-within:bg-white">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className="sr-only">운영 계정 찾기</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름, @핸들, 언어로 찾기"
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
        {visible.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-slate-500">
            {operators.length === 0 ? '아직 운영 계정이 없어요. 계정 탭에서 먼저 만들어 주세요.' : '찾는 계정이 없어요.'}
          </li>
        ) : (
          visible.map((operator) => {
            const blocked = !operator.isActive ? '비활성' : operator.restricted ? '제재 중' : null
            const selected = operator.id === selectedId
            return (
              <li key={operator.id}>
                <button
                  type="button"
                  disabled={!!blocked}
                  onClick={() => onSelect(operator.id)}
                  aria-pressed={selected}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${
                    selected ? 'bg-sky-50' : 'active:bg-slate-100'
                  } disabled:opacity-50`}
                >
                  <OperatorAvatar operator={operator} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[15px] font-semibold">{operatorDisplayName(operator)}</span>
                    <span className="block break-all text-[13px] text-slate-500">
                      @{operator.handle} · {languageLabel(operator.language)}
                    </span>
                  </span>
                  {blocked ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {blocked}
                    </span>
                  ) : selected ? (
                    <Check className="h-5 w-5 shrink-0 text-sky-600" aria-label="선택됨" />
                  ) : null}
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}
