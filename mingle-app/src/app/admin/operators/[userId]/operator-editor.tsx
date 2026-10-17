'use client'

import Link from 'next/link'
import { useMemo, useState, type ChangeEvent } from 'react'
import { ArrowLeft, Camera, Check, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import type { OperatorAccountDetail } from '@/server/operators/operator-admin-query'
import { OPERATOR_NOTES_MAX_LENGTH, type PersonaDraftField, type PersonaFieldError } from '@/server/operators/persona-rules'
import { InactiveChip, Notice, OperatorAvatar, OperatorChip } from '../_components/operator-ui'
import { PersonaFields, type PersonaFieldValues } from '../_components/persona-fields'
import { AVATAR_ACCEPT, getJson, sendJson, uploadOperatorAvatar } from '../_lib/client-api'
import { bioStatusLabel, fieldErrorMessage, requestErrorMessage } from '../_lib/copy'
import { koreanLanguageName, type CountryOption, type LanguageOption } from '../_lib/options'

const CREATED_AT_FORMAT = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' })

const SECONDARY_BUTTON = 'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 active:bg-slate-100 disabled:text-slate-400'

function detailToValues(detail: OperatorAccountDetail): PersonaFieldValues {
  return {
    name: detail.name ?? '',
    handle: detail.handle,
    personaCountry: detail.personaCountry ?? '',
    city: detail.city ?? '',
    birthYear: detail.birthYear ? String(detail.birthYear) : '',
    primaryLanguage: detail.primaryLanguage ?? '',
    bio: detail.bio,
    gender: '',
  }
}

/** Only the fields that changed; country and city always travel together. */
function buildPatch(base: PersonaFieldValues, next: PersonaFieldValues, baseNotes: string, nextNotes: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (next.name.trim() !== base.name.trim()) patch.name = next.name
  if (next.handle.trim() !== base.handle) patch.handle = next.handle
  if (next.bio.trim() !== base.bio.trim()) patch.bio = next.bio
  if (next.primaryLanguage !== base.primaryLanguage) patch.primaryLanguage = next.primaryLanguage
  if (next.birthYear !== base.birthYear) patch.birthYear = Number(next.birthYear)
  if (next.personaCountry !== base.personaCountry || next.city !== base.city) {
    patch.personaCountry = next.personaCountry
    patch.city = next.city
  }
  if (nextNotes.trim() !== baseNotes.trim()) patch.notes = nextNotes
  return patch
}

export function OperatorEditor({
  initial,
  countries,
  languages,
  currentYear,
}: {
  initial: OperatorAccountDetail
  countries: CountryOption[]
  languages: LanguageOption[]
  currentYear: number
}) {
  const [account, setAccount] = useState(initial)
  const [values, setValues] = useState(() => detailToValues(initial))
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [errors, setErrors] = useState<PersonaFieldError[]>([])
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [photo, setPhoto] = useState<{ status: 'idle' | 'uploading' | 'failed'; error?: string }>({ status: 'idle' })
  const [copied, setCopied] = useState(false)

  const baseline = useMemo(() => detailToValues(account), [account])
  const patch = useMemo(() => buildPatch(baseline, values, account.notes ?? '', notes), [baseline, values, account.notes, notes])
  const dirty = Object.keys(patch).length > 0
  const endpoint = `/admin/operators/api/${encodeURIComponent(account.id)}`
  const notesError = errors.find(error => error.field === 'notes')?.error

  const applyAccount = (next: OperatorAccountDetail) => {
    setAccount(next)
    setValues(detailToValues(next))
    setNotes(next.notes ?? '')
  }

  const onFieldsChange = (next: Partial<PersonaFieldValues>, fields: PersonaDraftField[]) => {
    setValues(current => ({ ...current, ...next }))
    setErrors(current => current.filter(error => !fields.includes(error.field)))
    setMessage(null)
  }

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setMessage(null)
    const result = await sendJson<{ account: OperatorAccountDetail }>(endpoint, patch, 'PATCH')
    setSaving(false)
    if (!result.ok) {
      setErrors(result.errors)
      setMessage({ tone: 'error', text: requestErrorMessage(result.error) })
      return
    }
    applyAccount(result.data.account)
    setErrors([])
    setMessage({ tone: 'success', text: patch.bio !== undefined ? '저장했습니다. 소개는 잠시 뒤 번역됩니다.' : '저장했습니다.' })
  }

  const refresh = async () => {
    setRefreshing(true)
    const result = await getJson<{ account: OperatorAccountDetail }>(endpoint)
    setRefreshing(false)
    if (!result.ok) {
      setMessage({ tone: 'error', text: requestErrorMessage(result.error) })
      return
    }
    const fresh = result.data.account
    if (dirty) setAccount(current => ({ ...current, image: fresh.image, bioStatus: fresh.bioStatus, bioLanguages: fresh.bioLanguages }))
    else applyAccount(fresh)
  }

  const changePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPhoto({ status: 'uploading' })
    const result = await uploadOperatorAvatar(account.id, file)
    if (result.ok) {
      setAccount(current => ({ ...current, image: result.data.image }))
      setPhoto({ status: 'idle' })
    } else {
      setPhoto({ status: 'failed', error: requestErrorMessage(result.error) })
    }
  }

  const copyLink = async () => {
    if (!account.profilePath) return
    try {
      await navigator.clipboard.writeText(new URL(account.profilePath, window.location.origin).toString())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setMessage({ tone: 'error', text: '복사하지 못했습니다. "프로필 열기"에서 주소를 복사하세요.' })
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Link href="/admin/operators" className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 active:bg-slate-200" aria-label="운영 계정 목록으로">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-slate-900">운영 계정</h1>
      </div>

      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="계정 정보">
        <div className="flex items-center gap-4">
          <OperatorAvatar image={account.image} name={account.name} size={80} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="min-w-0 break-words text-lg font-semibold text-slate-900">{account.name || '이름 없음'}</span>
              <OperatorChip />
              {!account.isActive ? <InactiveChip /> : null}
            </div>
            <p className="break-all text-sm font-medium text-slate-600">@{account.handle}</p>
            <p className="mt-0.5 text-xs text-slate-500">{CREATED_AT_FORMAT.format(new Date(account.createdAt))} 생성</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <label className={`${SECONDARY_BUTTON} cursor-pointer px-2 ${photo.status === 'uploading' ? 'pointer-events-none opacity-60' : ''}`}>
            {photo.status === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
            {photo.status === 'uploading' ? '올리는 중' : '사진'}
            <input type="file" accept={AVATAR_ACCEPT} className="sr-only" onChange={changePhoto} disabled={photo.status === 'uploading'} aria-label="프로필 사진 바꾸기" />
          </label>
          {account.profilePath ? (
            <a href={account.profilePath} target="_blank" rel="noopener noreferrer" className={`${SECONDARY_BUTTON} px-2`}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              프로필
            </a>
          ) : <span />}
          <button type="button" className={`${SECONDARY_BUTTON} px-2`} onClick={copyLink} disabled={!account.profilePath}>
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? '복사됨' : '링크 복사'}
          </button>
        </div>
        {photo.status === 'failed' && photo.error ? <div className="mt-3"><Notice tone="error">{photo.error}</Notice></div> : null}
        <p className="mt-3 break-words text-xs leading-5 text-slate-500">
          이 계정은 로그인할 수 없고, 앱에서 이름 옆에 항상 &lsquo;운영 계정&rsquo; 표시가 붙습니다. 사진은 정사각형으로 잘리고 위치 정보는 지워집니다.
        </p>
      </section>

      <section className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="소개 번역 상태">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700">{bioStatusLabel(account.bioStatus)}</p>
          {account.bioLanguages.length ? (
            <p className="mt-0.5 break-words text-xs text-slate-500">{account.bioLanguages.map(code => koreanLanguageName(code)).join(', ')}</p>
          ) : null}
        </div>
        <button type="button" className={`${SECONDARY_BUTTON} w-11 shrink-0 px-0`} onClick={refresh} disabled={refreshing} aria-label="상태 새로고침">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </section>

      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="프로필 수정">
        <PersonaFields
          idPrefix="operator"
          values={values}
          onChange={onFieldsChange}
          errors={errors}
          countries={countries}
          languages={languages}
          currentYear={currentYear}
          disabled={saving}
        />
        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label htmlFor="operator-notes" className="text-sm font-medium text-slate-700">메모 <span className="font-normal text-slate-400">(스태프만 봄)</span></label>
            <span className="text-xs tabular-nums text-slate-400">{notes.length}/{OPERATOR_NOTES_MAX_LENGTH}</span>
          </div>
          <textarea
            id="operator-notes"
            value={notes}
            onChange={event => {
              setNotes(event.target.value)
              setErrors(current => current.filter(error => error.field !== 'notes'))
              setMessage(null)
            }}
            maxLength={OPERATOR_NOTES_MAX_LENGTH}
            rows={3}
            disabled={saving}
            placeholder="예: 여행 이야기 담당, 답장 말투 메모"
            aria-invalid={Boolean(notesError)}
            className={`w-full rounded-xl border bg-white px-3 py-2.5 text-base leading-6 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 ${notesError ? 'border-rose-400' : 'border-slate-300'}`}
          />
          {notesError ? <p className="mt-1 text-xs text-rose-600">{fieldErrorMessage(notesError)}</p> : null}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 mt-3 grid gap-2 border-t border-slate-200 bg-slate-50/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur">
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-base font-semibold text-white shadow-sm active:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}
          {saving ? '저장하는 중…' : dirty ? '저장' : '바뀐 내용 없음'}
        </button>
      </div>
    </div>
  )
}
