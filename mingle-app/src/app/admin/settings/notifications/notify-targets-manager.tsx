'use client'

import { useState, type FormEvent } from 'react'
import { BellOff, BellRing, Loader2, UserRound } from 'lucide-react'
import { buildProfileImageTransform } from '@/lib/profile-image-crop'
import type { AdminNotifyTargetDto } from '@/app/admin/settings/_lib/notify-targets'
import {
  describeNotifyTargetAdded,
  describeNotifyTargetDevices,
  describeNotifyTargetError,
  describeNotifyTargetRemoved,
} from '@/app/admin/settings/_lib/notify-target-copy'

const TARGETS_API = '/admin/settings/api/notify-targets'
const AVATAR_SIZE = 44

type Notice = { tone: 'error' | 'success'; text: string }

type TargetsResponse = { targets?: AdminNotifyTargetDto[]; added?: boolean; removed?: boolean; error?: unknown }

async function readJson(response: Response): Promise<TargetsResponse> {
  try {
    return (await response.json()) as TargetsResponse
  } catch {
    return {}
  }
}

function TargetAvatar({ target }: { target: AdminNotifyTargetDto }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
      {target.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={target.image}
          alt=""
          className="h-full w-full object-cover"
          style={{
            transform: buildProfileImageTransform(AVATAR_SIZE, {
              scale: target.imageCropScale,
              x: target.imageCropX,
              y: target.imageCropY,
            }),
          }}
        />
      ) : (
        <UserRound size={24} className="text-slate-400" aria-hidden="true" />
      )}
    </span>
  )
}

export function NotifyTargetsManager({ initialTargets }: { initialTargets: AdminNotifyTargetDto[] }) {
  const [targets, setTargets] = useState(initialTargets)
  const [handle, setHandle] = useState('')
  const [adding, setAdding] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  async function addTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const typed = handle.trim().replace(/^@+/, '')
    if (!typed || adding) return
    setAdding(true)
    setFormError(null)
    setNotice(null)
    try {
      const response = await fetch(TARGETS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: typed }),
        cache: 'no-store',
      })
      const payload = await readJson(response)
      if (!response.ok || !Array.isArray(payload.targets)) {
        setFormError(describeNotifyTargetError(response.status, payload.error))
        return
      }
      setTargets(payload.targets)
      setHandle('')
      setNotice({ tone: 'success', text: describeNotifyTargetAdded(typed.toLowerCase(), payload.added === true) })
    } catch {
      setFormError(describeNotifyTargetError(0, null))
    } finally {
      setAdding(false)
    }
  }

  async function removeTarget(target: AdminNotifyTargetDto) {
    if (removingUserId) return
    setRemovingUserId(target.userId)
    setNotice(null)
    try {
      const response = await fetch(`${TARGETS_API}/${encodeURIComponent(target.userId)}`, {
        method: 'DELETE',
        cache: 'no-store',
      })
      const payload = await readJson(response)
      if (!response.ok || !Array.isArray(payload.targets)) {
        setNotice({ tone: 'error', text: describeNotifyTargetError(response.status, payload.error) })
        return
      }
      setTargets(payload.targets)
      setConfirmUserId(null)
      setNotice({ tone: 'success', text: describeNotifyTargetRemoved(target.handle) })
    } catch {
      setNotice({ tone: 'error', text: describeNotifyTargetError(0, null) })
    } finally {
      setRemovingUserId(null)
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <form onSubmit={addTarget} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" noValidate>
        <label htmlFor="notify-target-handle" className="block text-[15px] font-semibold text-slate-900">
          본인 Mingle 계정 핸들
        </label>
        <div className="mt-2 flex items-stretch gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-xl border border-slate-300 bg-white px-3 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200">
            <span className="shrink-0 text-base text-slate-400" aria-hidden="true">@</span>
            <input
              id="notify-target-handle"
              name="handle"
              value={handle}
              onChange={(event) => {
                setHandle(event.target.value)
                if (formError) setFormError(null)
              }}
              placeholder="handle"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              maxLength={40}
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? 'notify-target-handle-error' : undefined}
              className="h-12 min-w-0 flex-1 bg-transparent pl-1 text-base text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>
          <button
            type="submit"
            disabled={adding || !handle.trim().replace(/^@+/, '')}
            aria-busy={adding}
            className="flex h-12 min-w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-sky-600 px-4 text-[15px] font-semibold text-white active:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            {adding ? <Loader2 size={18} className="animate-spin" aria-label="추가하는 중" /> : '추가'}
          </button>
        </div>
        {formError ? (
          <p id="notify-target-handle-error" role="alert" className="mt-2 break-words text-sm leading-5 text-rose-600">
            {formError}
          </p>
        ) : (
          <p className="mt-2 break-words text-sm leading-5 text-slate-500">
            운영 계정이 아닌, 직접 로그인해 쓰는 계정을 추가하세요.
          </p>
        )}
      </form>

      <div aria-live="polite">
        {notice ? (
          <p
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`break-words rounded-xl px-4 py-3 text-sm leading-5 ${
              notice.tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-800'
            }`}
          >
            {notice.text}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="notify-targets-heading">
        <h2 id="notify-targets-heading" className="text-[15px] font-semibold text-slate-700">
          등록된 계정 <span className="text-slate-400">{targets.length}</span>
        </h2>
        {targets.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
            <BellOff size={24} className="mx-auto text-slate-400" aria-hidden="true" />
            <p className="mt-2 break-words text-[15px] leading-6 text-slate-600">
              아직 알림을 받을 계정이 없습니다. 위에서 본인 계정의 핸들을 추가하세요.
            </p>
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {targets.map((target) => {
              const devices = describeNotifyTargetDevices(target)
              const displayName = target.name?.trim() || `@${target.handle}`
              const confirming = confirmUserId === target.userId
              const removing = removingUserId === target.userId
              return (
                <li key={target.userId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <TargetAvatar target={target} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-1.5 break-words text-[15px] font-semibold leading-6 text-slate-900">
                        <span className="min-w-0 break-words">{displayName}</span>
                        {target.isOfficial ? (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">공식</span>
                        ) : null}
                      </p>
                      <p className="break-all text-sm leading-5 text-slate-500">@{target.handle}</p>
                      <p className={`mt-1 flex items-start gap-1.5 break-words text-sm leading-5 ${devices.ready ? 'text-sky-700' : 'text-amber-700'}`}>
                        {devices.ready ? (
                          <BellRing size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <BellOff size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                        )}
                        <span>{devices.text}</span>
                      </p>
                    </div>
                    {confirming ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmUserId(target.userId)
                          setNotice(null)
                        }}
                        aria-label={`${displayName} 알림 해제`}
                        className="flex h-11 min-w-[3.75rem] shrink-0 items-center justify-center rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                      >
                        해제
                      </button>
                    )}
                  </div>
                  {confirming ? (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <p className="break-words text-sm leading-5 text-slate-700">
                        @{target.handle} 계정의 알림을 해제할까요? 이 계정의 기기로는 더 이상 알림이 가지 않습니다.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmUserId(null)}
                          disabled={removing}
                          className="flex h-11 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeTarget(target)}
                          disabled={removing}
                          aria-busy={removing}
                          className="flex h-11 flex-1 items-center justify-center rounded-xl bg-rose-600 text-sm font-semibold text-white active:bg-rose-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                        >
                          {removing ? <Loader2 size={18} className="animate-spin" aria-label="해제하는 중" /> : '해제'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
