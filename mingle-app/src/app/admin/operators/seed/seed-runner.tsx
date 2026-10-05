'use client'

import { useCallback, useRef, useState } from 'react'
import { Loader2, Play, Square } from 'lucide-react'
import type { CreateOperatorsResponse, PersonaDraftsResponse } from '@/server/operators/operator-api-types'
import { defaultSeedRows, parseSeedCount, SEED_CHUNK_SIZE, seedPlanTotal, type SeedPlanRow } from './seed-plan'

const DRAFTS_ENDPOINT = '/admin/operators/api/drafts'
const CREATE_ENDPOINT = '/admin/operators/api/create'
const MAX_EMPTY_ROUNDS = 3
const AVOID_NAMES_MAX = 40

type Progress = Record<string, { created: number; error: string | null }>

class SeedUnauthorizedError extends Error {}

async function postJson<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (response.status === 401) throw new SeedUnauthorizedError('unauthorized')
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null
  if (!response.ok || !payload) throw new Error(payload?.error || `http_${response.status}`)
  return payload
}

const ERROR_COPY: Record<string, string> = {
  llm_unavailable: 'AI 키(GEMINI_API_KEY)가 설정되지 않았습니다.',
  draft_generation_failed: 'AI 초안 생성에 실패했습니다.',
  no_progress: '초안이 계속 거절되어 중단했습니다.',
}

/**
 * Creates operator accounts country by country from an editable plan, using
 * the same two endpoints as the creation wizard (AI drafts, then create),
 * ten at a time. Runs in this tab: closing it stops after the current batch,
 * and accounts already created stay.
 */
export function SeedRunner() {
  const [rows, setRows] = useState<SeedPlanRow[]>(defaultSeedRows)
  const [ageMin, setAgeMin] = useState('20')
  const [ageMax, setAgeMax] = useState('34')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Progress>({})
  const [message, setMessage] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const total = seedPlanTotal(rows)
  const createdTotal = Object.values(progress).reduce((sum, entry) => sum + entry.created, 0)
  const minAge = parseSeedCount(ageMin)
  const maxAge = parseSeedCount(ageMax)
  const agesValid = minAge >= 20 && maxAge <= 80 && minAge <= maxAge

  const setCount = (code: string, raw: string) => {
    setRows((current) => current.map((row) => (row.code === code ? { ...row, count: parseSeedCount(raw) } : row)))
  }

  const run = useCallback(async () => {
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setMessage(null)
    const done: Progress = {}
    setProgress({})
    const names: string[] = []
    const handles: string[] = []
    try {
      for (const row of rows) {
        if (row.count <= 0) continue
        done[row.code] = { created: 0, error: null }
        let emptyRounds = 0
        while (done[row.code].created < row.count && !controller.signal.aborted) {
          const want = Math.min(SEED_CHUNK_SIZE, row.count - done[row.code].created)
          let createdNow = 0
          try {
            const { drafts } = await postJson<PersonaDraftsResponse>(DRAFTS_ENDPOINT, {
              count: want,
              countries: [row.code],
              ageMin: minAge,
              ageMax: maxAge,
              genderMix: 'balanced',
              avoidNames: names.slice(-AVOID_NAMES_MAX),
              avoidHandles: handles.slice(-AVOID_NAMES_MAX),
            }, controller.signal)
            if (drafts.length > 0) {
              const { results } = await postJson<CreateOperatorsResponse>(CREATE_ENDPOINT, { drafts }, controller.signal)
              for (const result of results) {
                if (!result.ok) continue
                createdNow += 1
                handles.push(result.handle)
                const name = drafts[result.index]?.name
                if (name) names.push(name)
              }
            }
          } catch (error) {
            if (error instanceof SeedUnauthorizedError) throw error
            if (controller.signal.aborted) break
            const code = error instanceof Error ? error.message : 'unknown'
            done[row.code] = { ...done[row.code], error: ERROR_COPY[code] ?? '요청에 실패했습니다.' }
            // Without the AI nothing else will work either.
            if (code === 'llm_unavailable') throw error
          }
          done[row.code] = { ...done[row.code], created: done[row.code].created + createdNow }
          setProgress({ ...done })
          emptyRounds = createdNow > 0 ? 0 : emptyRounds + 1
          if (emptyRounds >= MAX_EMPTY_ROUNDS) {
            done[row.code] = { ...done[row.code], error: done[row.code].error ?? ERROR_COPY.no_progress }
            setProgress({ ...done })
            break
          }
        }
        if (controller.signal.aborted) break
      }
      const created = Object.values(done).reduce((sum, entry) => sum + entry.created, 0)
      setMessage(controller.signal.aborted ? `중단했습니다. ${created}개 계정을 만들었습니다.` : `끝났습니다. ${created}개 계정을 만들었습니다.`)
    } catch (error) {
      if (error instanceof SeedUnauthorizedError) {
        window.location.assign(`/admin?next=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      setMessage(ERROR_COPY[error instanceof Error ? error.message : ''] ?? '중단되었습니다. 다시 시작하면 남은 인원만큼 더 만듭니다.')
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }, [maxAge, minAge, rows])

  const inputClass = 'min-h-11 w-20 rounded-lg border border-slate-300 bg-white px-2 text-center text-base text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100'

  return (
    <div className="mt-4 flex flex-col gap-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-slate-900">나이 범위</h2>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <label htmlFor="seed-age-min" className="sr-only">최소 나이</label>
          <input id="seed-age-min" type="number" inputMode="numeric" min={20} max={80} value={ageMin} disabled={running}
            onChange={(event) => setAgeMin(event.target.value)} className={inputClass} />
          <span>~</span>
          <label htmlFor="seed-age-max" className="sr-only">최대 나이</label>
          <input id="seed-age-max" type="number" inputMode="numeric" min={20} max={80} value={ageMax} disabled={running}
            onChange={(event) => setAgeMax(event.target.value)} className={inputClass} />
          <span>세</span>
        </div>
        {!agesValid ? <p role="alert" className="mt-2 text-sm text-rose-700">20~80 사이로, 최소가 최대보다 크지 않게 입력해 주세요.</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-slate-900">국가별 인원</h2>
          <p className="text-sm text-slate-600">합계 <strong>{total}</strong>명{createdTotal > 0 ? ` · 생성 ${createdTotal}명` : ''}</p>
        </div>
        <ul className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {rows.map((row) => {
            const state = progress[row.code]
            return (
              <li key={row.code} className="flex min-w-0 items-center gap-2">
                <label htmlFor={`seed-${row.code}`} className="min-w-0 flex-1 truncate text-sm text-slate-800">{row.nameKo}</label>
                {state ? (
                  <span className={`shrink-0 text-xs ${state.error ? 'text-rose-700' : 'text-emerald-700'}`} title={state.error ?? undefined}>
                    {state.created}/{row.count}{state.error ? ' ⚠' : ''}
                  </span>
                ) : null}
                <input id={`seed-${row.code}`} type="number" inputMode="numeric" min={0} max={200} value={String(row.count)} disabled={running}
                  onChange={(event) => setCount(row.code, event.target.value)} className={inputClass} />
              </li>
            )
          })}
        </ul>
      </section>

      {running ? (
        <button
          type="button"
          onClick={() => abortRef.current?.abort()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 active:bg-rose-100"
        >
          <Square size={16} aria-hidden="true" />
          중단 ({createdTotal}/{total})
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`운영 계정 ${total}개를 바로 만듭니다. 초안 검토 단계 없이 생성됩니다. 계속할까요?`)) void run()
          }}
          disabled={total === 0 || !agesValid}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white active:bg-sky-700 disabled:opacity-50"
        >
          <Play size={16} aria-hidden="true" />
          {total}개 계정 만들기
        </button>
      )}
      {message ? <p role="status" className="break-words text-sm text-slate-700">{message}</p> : null}

      <ul className="list-disc space-y-1 break-words pl-5 text-sm leading-6 text-slate-500">
        <li>이름, 핸들, 소개, 도시, 언어는 AI가 나라에 맞게 새로 만듭니다. 검토 없이 바로 생성되니, 만든 뒤 계정 탭에서 확인하고 고칠 수 있습니다.</li>
        <li>프로필 사진은 만들지 않습니다. 계정 탭에서 계정마다 올려야 합니다.</li>
        <li>이 탭을 닫으면 멈춥니다. 이미 만든 계정은 남고, 다시 시작하면 입력한 인원만큼 새로 더 만듭니다.</li>
      </ul>
    </div>
  )
}
