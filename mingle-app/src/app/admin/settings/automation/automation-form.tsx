'use client'

import Link from 'next/link'
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronRight, Loader2, Play, Square } from 'lucide-react'
import type { AutomationSettings } from '@/server/operator-automation/settings'
import type { AutomationCounts } from '@/server/operator-automation/worker'

const ENDPOINT = '/admin/settings/api/automation'
const RUN_ENDPOINT = '/admin/settings/api/automation/run'

type Payload = { settings: AutomationSettings; counts: AutomationCounts }
type Task = 'avatar' | 'account' | 'posts'
type RunResponse = {
  done?: boolean
  ok?: boolean
  reason?: string
  error?: string
  label?: string
  handle?: string
  country?: string
  generated?: number
  accounts?: number
  counts?: AutomationCounts
}

const REASON_COPY: Record<string, string> = {
  none_waiting: '사진 없는 계정이 없습니다.',
  target_reached: '목표 계정 수에 도달했습니다.',
  draft_failed: 'AI 초안 생성에 실패했습니다.',
  image_unavailable: '이미지 AI 키(OPENAI_API_KEY 또는 GEMINI_API_KEY)가 설정되지 않았습니다.',
  image_refused: '이미지 모델이 이 사진을 거절했습니다. 다음 시도에서는 다른 유형을 뽑습니다.',
  image_timeout: '이미지 생성 시간이 초과되었습니다.',
  image_request_failed: '이미지 생성 요청에 실패했습니다.',
  image_storage_failed: '이미지 저장에 실패했습니다.',
}

function toInt(raw: string): number {
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN
}

function within(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

function Switch({ checked, onChange, title, on, off }: { checked: boolean; onChange: (next: boolean) => void; title: string; on: string; off: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block break-words text-sm text-slate-500">{checked ? on : off}</span>
      </span>
      <span aria-hidden="true" className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-sky-500' : 'bg-slate-300'}`}>
        <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
      </span>
    </button>
  )
}

function NumberField({ id, label, hint, value, onChange, unit, invalid }: {
  id: string; label: string; hint: string; value: string; onChange: (next: string) => void; unit: string; invalid: boolean
}) {
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}</label>
      <p className="mt-0.5 break-words text-sm text-slate-500">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          className="min-h-11 w-28 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 aria-[invalid=true]:border-rose-400"
        />
        <span className="text-sm text-slate-600">{unit}</span>
      </div>
    </div>
  )
}

/** "지금 N개 만들기": repeats the one-unit run endpoint, with a stop button and the last result. */
function ManualRun({ task, label, unit, defaultCount, onCounts, describe }: {
  task: Task
  label: string
  unit: string
  defaultCount: number
  onCounts: (counts: AutomationCounts) => void
  describe: (response: RunResponse) => string
}) {
  const [count, setCount] = useState(String(defaultCount))
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; failed: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const stopRef = useRef(false)
  const wanted = toInt(count)
  const valid = within(wanted, 1, 200)

  const run = useCallback(async () => {
    stopRef.current = false
    setRunning(true)
    setMessage(null)
    let done = 0
    let failed = 0
    setProgress({ done, failed })
    try {
      for (let index = 0; index < wanted && !stopRef.current; index += 1) {
        const response = await fetch(RUN_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ task }),
        })
        if (response.status === 401) {
          window.location.assign(`/admin?next=${encodeURIComponent(window.location.pathname)}`)
          return
        }
        const payload = await response.json().catch(() => null) as RunResponse | null
        if (!response.ok || !payload) {
          failed += 1
          setMessage('요청에 실패했습니다.')
        } else {
          if (payload.counts) onCounts(payload.counts)
          const succeeded = payload.done === true && payload.ok !== false
          if (succeeded) done += 1
          else failed += 1
          setMessage(succeeded ? describe(payload) : REASON_COPY[payload.reason ?? payload.error ?? ''] ?? '만들지 못했습니다.')
          // Nothing left to do, or the AI is not configured: more calls would only repeat the answer.
          if (payload.done === false && payload.reason !== 'draft_failed') break
          if (payload.error === 'image_unavailable') break
        }
        setProgress({ done, failed })
        if (failed >= 5 && done === 0) break
      }
    } catch {
      setMessage('네트워크 오류로 멈췄습니다.')
    } finally {
      setProgress({ done, failed })
      setRunning(false)
    }
  }, [describe, onCounts, task, wanted])

  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={`manual-${task}`} className="sr-only">{label} 개수</label>
        <input
          id={`manual-${task}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={200}
          value={count}
          disabled={running}
          onChange={(event) => setCount(event.target.value)}
          className="min-h-11 w-20 rounded-lg border border-slate-300 bg-white px-2 text-center text-base text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
        />
        <span className="text-sm text-slate-600">{unit}</span>
        {running ? (
          <button
            type="button"
            onClick={() => { stopRef.current = true }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 active:bg-rose-100"
          >
            <Square size={14} aria-hidden="true" />
            중단
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void run()}
            disabled={!valid}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-50"
          >
            <Play size={14} aria-hidden="true" />
            지금 만들기
          </button>
        )}
      </div>
      {progress ? (
        <p role="status" className="mt-2 break-words text-sm text-slate-600">
          성공 {progress.done} · 실패 {progress.failed}{message ? ` · ${message}` : ''}
        </p>
      ) : null}
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-base font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

/**
 * Every automatic generation rule in one place, each with its manual
 * counterpart: profile photos (one every N minutes), accounts (N per day up
 * to a target) and latent posts (its own page; a manual refill here).
 */
export function AutomationForm({ initial, imageModel }: { initial: Payload; imageModel: string }) {
  const [saved, setSaved] = useState(initial.settings)
  const [counts, setCounts] = useState(initial.counts)
  const [avatarsEnabled, setAvatarsEnabled] = useState(initial.settings.avatars.enabled)
  const [interval, setIntervalMinutes] = useState(String(initial.settings.avatars.intervalMinutes))
  const [accountsEnabled, setAccountsEnabled] = useState(initial.settings.accounts.enabled)
  const [perDay, setPerDay] = useState(String(initial.settings.accounts.perDay))
  const [totalTarget, setTotalTarget] = useState(String(initial.settings.accounts.totalTarget))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const intervalValue = toInt(interval)
  const perDayValue = toInt(perDay)
  const totalValue = toInt(totalTarget)
  const intervalValid = within(intervalValue, 1, 1440)
  const perDayValid = within(perDayValue, 1, 100)
  const totalValid = within(totalValue, 1, 2000)
  const valid = intervalValid && perDayValid && totalValid
  const dirty = avatarsEnabled !== saved.avatars.enabled || accountsEnabled !== saved.accounts.enabled
    || (valid && (intervalValue !== saved.avatars.intervalMinutes || perDayValue !== saved.accounts.perDay || totalValue !== saved.accounts.totalTarget))

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
        body: JSON.stringify({
          avatars: { enabled: avatarsEnabled, intervalMinutes: intervalValue },
          accounts: { enabled: accountsEnabled, perDay: perDayValue, totalTarget: totalValue },
        }),
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
      setCounts(payload.counts)
      setNotice('저장했습니다. 1분 안에 적용됩니다.')
    } catch {
      setError('저장하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  const describeAvatar = useCallback((response: RunResponse) => `방금: ${response.label ?? '사진 생성'}`, [])
  const describeAccount = useCallback((response: RunResponse) => `방금: @${response.handle ?? ''} (${response.country ?? ''})`, [])
  const describePosts = useCallback((response: RunResponse) => `방금: 계정 ${response.accounts ?? 0}개에 글 ${response.generated ?? 0}개`, [])

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
      <Card title="프로필 사진">
        <p className="mb-2 break-words text-sm text-slate-600">
          활성 계정 {counts.operators}개 중 사진 없는 계정 <strong>{counts.withoutPhoto}개</strong>
        </p>
        <Switch
          checked={avatarsEnabled}
          onChange={setAvatarsEnabled}
          title="자동 생성"
          on="켜짐: 사진 없는 계정에 차례로 AI 사진을 만듭니다."
          off="꺼짐: 수동으로만 만듭니다."
        />
        <NumberField id="auto-avatar-interval" label="간격" hint="이 시간마다 한 장씩 만듭니다. 1~1440분." value={interval} onChange={setIntervalMinutes} unit="분마다 1장" invalid={!intervalValid} />
        <ManualRun task="avatar" label="수동: 사진 없는 계정에 지금 만들기" unit="장" defaultCount={5} onCounts={setCounts} describe={describeAvatar} />
        <Link href="/admin/operators/avatars" className="mt-3 flex min-h-11 items-center justify-between rounded-lg px-1 text-sm font-semibold text-sky-700 active:bg-sky-50">
          사진 검수·다시 만들기
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </Card>

      <Card title="계정">
        <Switch
          checked={accountsEnabled}
          onChange={setAccountsEnabled}
          title="자동 생성"
          on="켜짐: 목표 수까지 매일 조금씩 새 계정을 만듭니다."
          off="꺼짐: 수동으로만 만듭니다."
        />
        <NumberField id="auto-account-per-day" label="하루 생성 수" hint="하루에 이만큼, 같은 간격으로 만듭니다. 1~100개." value={perDay} onChange={setPerDay} unit="개 / 일" invalid={!perDayValid} />
        <NumberField id="auto-account-total" label="목표 계정 수" hint="활성 운영 계정이 이 수가 되면 멈춥니다. 1~2000개." value={totalTarget} onChange={setTotalTarget} unit="개까지" invalid={!totalValid} />
        <p className="mt-3 break-words text-sm text-slate-500">
          나라는 기본 분포(한국·일본 각 22%, 나머지 분산)에서 가장 모자란 곳으로 정해집니다.
        </p>
        <ManualRun task="account" label="수동: 지금 계정 만들기" unit="개" defaultCount={1} onCounts={setCounts} describe={describeAccount} />
        <Link href="/admin/operators/seed" className="mt-3 flex min-h-11 items-center justify-between rounded-lg px-1 text-sm font-semibold text-sky-700 active:bg-sky-50">
          국가별 인원을 정해 한 번에 만들기
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </Card>

      <Card title="잠재 글">
        <p className="break-words text-sm text-slate-600">
          계정당 미리 써 둘 글 수와 하루 발행 비율은 잠재 글 설정에서 정합니다.
        </p>
        <ManualRun task="posts" label="수동: 지금 글 채우기 (한 번에 계정 3개, 20개씩)" unit="회" defaultCount={1} onCounts={setCounts} describe={describePosts} />
        <Link href="/admin/settings/post-reserve" className="mt-3 flex min-h-11 items-center justify-between rounded-lg px-1 text-sm font-semibold text-sky-700 active:bg-sky-50">
          잠재 글 설정 (자동 채우기·하루 발행 비율)
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </Card>

      <button
        type="submit"
        disabled={!valid || !dirty || saving}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white active:bg-sky-700 disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
        자동 규칙 저장
      </button>
      {!valid ? <p role="alert" className="text-sm text-rose-700">범위를 벗어난 값이 있습니다.</p> : null}
      {error ? <p role="alert" className="break-words text-sm text-rose-700">{error}</p> : null}
      {notice ? <p role="status" className="break-words text-sm text-emerald-700">{notice}</p> : null}

      <ul className="list-disc space-y-1 break-words pl-5 text-sm leading-6 text-slate-500">
        <li>사진은 계정의 성별·나이·나라·도시·소개에 맞춰 유형(얼굴, 가린 얼굴, 뒷모습, 몸 위주, 사물, 동물, 풍경 등)을 뽑아 만듭니다. 이미지 모델: {imageModel}</li>
        <li>수동 실행은 이 탭이 열려 있는 동안 하나씩 진행하고, 자동 규칙이 꺼져 있어도 동작합니다.</li>
        <li>자동으로 만든 계정은 검토 없이 생성됩니다. 사진과 글은 위 규칙이 켜져 있으면 이어서 채워집니다.</li>
      </ul>
    </form>
  )
}
