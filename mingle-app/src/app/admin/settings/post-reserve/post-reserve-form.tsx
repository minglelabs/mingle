'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { PostReserveSettings } from '@/server/operator-post-reserve/settings'
import type { PostReserveStats } from '@/server/operator-post-reserve/worker'

const ENDPOINT = '/admin/settings/api/post-reserve'
const STATS_REFRESH_MS = 30_000

type Payload = { settings: PostReserveSettings; stats: PostReserveStats }

function parseNumber(raw: string): number {
  return /^\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN
}

/** The reserve switch, its size per account and the daily release share, plus live fill numbers. */
export function PostReserveForm({ initial, model }: { initial: Payload; model: string }) {
  const [saved, setSaved] = useState(initial.settings)
  const [stats, setStats] = useState(initial.stats)
  const [enabled, setEnabled] = useState(initial.settings.enabled)
  const [target, setTarget] = useState(String(initial.settings.targetPerOperator))
  const [percent, setPercent] = useState(String(initial.settings.dailyPercent))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const targetValue = parseNumber(target)
  const percentValue = parseNumber(percent)
  const targetValid = Number.isInteger(targetValue) && targetValue >= 10 && targetValue <= 500
  const percentValid = Number.isFinite(percentValue) && percentValue >= 0.1 && percentValue <= 10
  const valid = targetValid && percentValid
  const dirty = enabled !== saved.enabled || (valid && (targetValue !== saved.targetPerOperator || percentValue !== saved.dailyPercent))
  const perDay = valid ? Math.max(0.1, (targetValue * percentValue) / 100) : null

  const refreshStats = useCallback(async () => {
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok) return
      const payload = await response.json() as Payload
      setStats(payload.stats)
    } catch {
      // Keep the last numbers; the next refresh retries.
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => { void refreshStats() }, STATS_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refreshStats])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(ENDPOINT, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled, targetPerOperator: targetValue, dailyPercent: percentValue }),
      })
      if (response.status === 401) {
        window.location.assign(`/admin?next=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      const payload = await response.json().catch(() => null) as Payload | null
      if (!response.ok || !payload?.settings) {
        setError('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
      setSaved(payload.settings)
      setStats(payload.stats)
      setNotice(payload.settings.enabled ? '저장했습니다. 1분 안에 글 생성과 발행이 시작됩니다.' : '저장했습니다. 생성과 발행이 멈춰 있습니다.')
    } catch {
      setError('저장하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'min-h-11 w-28 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 aria-[invalid=true]:border-rose-400'
  const filled = Math.max(0, stats.operators - stats.operatorsBelowTarget)

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-slate-900">현재 상태</h2>
          <button
            type="button"
            onClick={() => void refreshStats()}
            aria-label="새로고침"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
        <dl className="mt-1 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-slate-500">활성 운영 계정</dt><dd className="text-lg font-semibold">{stats.operators}</dd></div>
          <div><dt className="text-slate-500">다 채워진 계정</dt><dd className="text-lg font-semibold">{filled} / {stats.operators}</dd></div>
          <div><dt className="text-slate-500">대기 중인 글</dt><dd className="text-lg font-semibold">{stats.waiting.toLocaleString()}</dd></div>
          <div><dt className="text-slate-500">최근 24시간 발행</dt><dd className="text-lg font-semibold">{stats.publishedLast24h.toLocaleString()}</dd></div>
          <div><dt className="text-slate-500">누적 발행</dt><dd className="text-lg font-semibold">{stats.published.toLocaleString()}</dd></div>
          <div><dt className="text-slate-500">실패</dt><dd className="text-lg font-semibold">{stats.failed.toLocaleString()}</dd></div>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((current) => !current)}
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-slate-900">잠재 글 생성·발행</span>
            <span className="mt-0.5 block break-words text-sm text-slate-500">
              {enabled ? '켜짐: 계정마다 글을 채우고 매일 조금씩 올립니다.' : '꺼짐: 새로 만들지도 올리지도 않습니다.'}
            </span>
          </span>
          <span
            aria-hidden="true"
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-sky-500' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
          </span>
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="reserve-target" className="block text-[15px] font-semibold text-slate-900">계정당 잠재 글 수</label>
        <p className="mt-0.5 break-words text-sm text-slate-500">계정마다 이만큼 미리 써 둡니다. 발행되어 줄어들면 다시 채웁니다. 10~500개.</p>
        <div className="mt-3 flex items-center gap-2">
          <input id="reserve-target" type="number" inputMode="numeric" min={10} max={500} step={1} value={target}
            onChange={(event) => setTarget(event.target.value)} aria-invalid={!targetValid} className={inputClass} />
          <span className="text-sm text-slate-600">개</span>
        </div>

        <label htmlFor="reserve-percent" className="mt-5 block text-[15px] font-semibold text-slate-900">하루 발행 비율</label>
        <p className="mt-0.5 break-words text-sm text-slate-500">계정당 잠재 글 수의 몇 %를 하루에 올릴지입니다. 0.1~10%.</p>
        <div className="mt-3 flex items-center gap-2">
          <input id="reserve-percent" type="number" inputMode="decimal" min={0.1} max={10} step={0.1} value={percent}
            onChange={(event) => setPercent(event.target.value)} aria-invalid={!percentValid} className={inputClass} />
          <span className="text-sm text-slate-600">%</span>
        </div>
        {perDay !== null ? (
          <p className="mt-3 break-words text-sm text-slate-700">
            계정 하나가 하루 약 <strong>{Number(perDay.toFixed(1))}개</strong>, 전체 {stats.operators}개 계정이 하루 약{' '}
            <strong>{Math.round(perDay * stats.operators).toLocaleString()}개</strong>를 올립니다.
          </p>
        ) : (
          <p role="alert" className="mt-3 text-sm text-rose-700">글 수는 10~500의 정수, 비율은 0.1~10 사이로 입력해 주세요.</p>
        )}
      </section>

      <button
        type="submit"
        disabled={!valid || !dirty || saving}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white active:bg-sky-700 disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
        저장
      </button>
      {error ? <p role="alert" className="break-words text-sm text-rose-700">{error}</p> : null}
      {notice ? <p role="status" className="break-words text-sm text-emerald-700">{notice}</p> : null}

      <ul className="list-disc space-y-1 break-words pl-5 text-sm leading-6 text-slate-500">
        <li>글은 계정의 프로필(이름, 소개, 나이, 도시)과 주 언어로 AI가 새로 씁니다. 모델: {model}</li>
        <li>1분마다 계정 3개에 20개씩 채웁니다. 계정 100개를 200개씩 채우는 데 약 5~6시간 걸립니다.</li>
        <li>나중에 올라갈 글이라 날짜·계절·날씨·시사 내용은 쓰지 않게 했습니다. 사진 없는 글만 만듭니다.</li>
        <li>발행 시각은 계정마다 불규칙하고, 그 나라 시간으로 새벽(0~8시)에는 올리지 않습니다.</li>
        <li>비율을 바꾸면 각 계정의 다음 글부터 새 간격이 적용됩니다.</li>
      </ul>
    </form>
  )
}
