'use client'

import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import type { AutoReplySettings } from '@/server/operator-auto-reply/settings'

const ENDPOINT = '/admin/settings/api/auto-reply'
const MIN_MINUTES = 1
const MAX_MINUTES = 1440
const PRESETS = [3, 5, 10, 30, 60]

/** The auto-reply switch and its delay N (minutes). Saved together with one button. */
export function AutoReplyForm({ initialSettings, model }: { initialSettings: AutoReplySettings; model: string }) {
  const [saved, setSaved] = useState(initialSettings)
  const [enabled, setEnabled] = useState(initialSettings.enabled)
  const [minutes, setMinutes] = useState(String(initialSettings.delayMinutes))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const parsed = /^\d+$/.test(minutes.trim()) ? Number(minutes.trim()) : Number.NaN
  const valid = Number.isInteger(parsed) && parsed >= MIN_MINUTES && parsed <= MAX_MINUTES
  const dirty = enabled !== saved.enabled || (valid && parsed !== saved.delayMinutes)

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
        body: JSON.stringify({ enabled, delayMinutes: parsed }),
      })
      if (response.status === 401) {
        window.location.assign(`/admin?next=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      const payload = await response.json().catch(() => null) as { settings?: AutoReplySettings } | null
      if (!response.ok || !payload?.settings) {
        setError('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
      setSaved(payload.settings)
      setEnabled(payload.settings.enabled)
      setMinutes(String(payload.settings.delayMinutes))
      setNotice(payload.settings.enabled
        ? `저장했습니다. ${payload.settings.delayMinutes}분 안에 답하지 않은 대화에 AI가 답합니다.`
        : '저장했습니다. AI 자동 답장이 꺼져 있습니다.')
    } catch {
      setError('저장하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((current) => !current)}
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-slate-900">AI 자동 답장</span>
            <span className="mt-0.5 block break-words text-sm text-slate-500">
              {enabled ? '켜짐: 기다린 대화에 AI가 운영 계정으로 답합니다.' : '꺼짐: 스태프만 답합니다.'}
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
        <label htmlFor="auto-reply-minutes" className="block text-[15px] font-semibold text-slate-900">
          기다리는 시간 (분)
        </label>
        <p className="mt-0.5 break-words text-sm text-slate-500">
          사용자의 마지막 메시지 후 이 시간 동안 스태프 답장이 없으면 AI가 답합니다. {MIN_MINUTES}~{MAX_MINUTES}분.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            id="auto-reply-minutes"
            type="number"
            inputMode="numeric"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            step={1}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            aria-invalid={!valid}
            className="min-h-11 w-28 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 aria-[invalid=true]:border-rose-400"
          />
          <span className="text-sm text-slate-600">분</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setMinutes(String(preset))}
              aria-pressed={valid && parsed === preset}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                valid && parsed === preset ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 active:bg-slate-100'
              }`}
            >
              {preset}분
            </button>
          ))}
        </div>
        {!valid ? (
          <p role="alert" className="mt-2 text-sm text-rose-700">{MIN_MINUTES}~{MAX_MINUTES} 사이의 정수를 입력해 주세요.</p>
        ) : null}
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
        <li>AI에게는 해당 운영 계정의 프로필, 그 계정이 올린 글, 대화방의 최근 30개 메시지만 전달됩니다. 모델: {model}</li>
        <li>1:1 대화에만 답합니다. 그룹 대화와 차단된 대화에는 답하지 않습니다.</li>
        <li>켠 시점 이후에 들어온 메시지에만 답하고, 하루가 지난 메시지에는 답하지 않습니다.</li>
        <li>스태프가 먼저 답하면 AI는 답하지 않습니다. AI 답장 후에도 인박스의 안읽음 표시는 남습니다.</li>
        <li>AI 답장은 감사 로그에 inbox.auto_reply로 기록됩니다.</li>
      </ul>
    </form>
  )
}
