'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, Check, ImagePlus, Loader2, Minus, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import type { CreateOperatorsResponse, PersonaDraftsResponse } from '@/server/operators/operator-api-types'
import type { PersonaGenderMix } from '@/server/operators/persona-draft'
import {
  PERSONA_MAX_AGE,
  PERSONA_MAX_DRAFTS,
  PERSONA_MIN_AGE,
  PERSONA_TONE_NOTE_MAX_LENGTH,
  type PersonaDraft,
  type PersonaDraftField,
  type PersonaFieldError,
} from '@/server/operators/persona-rules'
import type { PersonaCountryPreset } from '@/server/operators/persona-countries'
import { Notice, OperatorAvatar, OperatorChip } from '../_components/operator-ui'
import { draftToValues, PersonaFields, valuesToDraftPayload, type PersonaFieldValues } from '../_components/persona-fields'
import { AVATAR_ACCEPT, sendJson, uploadOperatorAvatar } from '../_lib/client-api'
import { requestErrorMessage } from '../_lib/copy'
import type { CountryOption, LanguageOption } from '../_lib/options'

type Step = 'settings' | 'drafts' | 'photos' | 'done'

type WizardDraft = {
  key: string
  values: PersonaFieldValues
  errors: PersonaFieldError[]
  message: string | null
  busy: boolean
}

type PhotoStatus = 'none' | 'queued' | 'uploading' | 'done' | 'failed'

type CreatedAccount = {
  userId: string
  name: string
  handle: string
  requestedHandle: string
  bioQueued: boolean
  photoStatus: PhotoStatus
  image: string | null
  preview: string | null
  photoError: string | null
  /** A picked file is kept for "다시 시도". */
  hasFile: boolean
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'settings', label: '설정' },
  { id: 'drafts', label: '초안' },
  { id: 'photos', label: '사진' },
  { id: 'done', label: '완료' },
]

const GENDER_MIX_OPTIONS: { value: PersonaGenderMix; label: string }[] = [
  { value: 'any', label: '상관없음' },
  { value: 'balanced', label: '반반' },
  { value: 'mostly_female', label: '여성 위주' },
  { value: 'mostly_male', label: '남성 위주' },
  { value: 'female', label: '모두 여성' },
  { value: 'male', label: '모두 남성' },
]

const MAX_AVOID = 40

const PRIMARY_BUTTON = 'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-base font-semibold text-white shadow-sm active:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500'
const SECONDARY_BUTTON = 'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 active:bg-slate-100 disabled:text-slate-400'
const CHIP_BUTTON = 'inline-flex min-h-11 items-center justify-center gap-1 rounded-full border px-3.5 text-sm font-medium'

let draftKeySequence = 0
function nextDraftKey(): string {
  draftKeySequence += 1
  return `draft-${draftKeySequence}`
}

function toWizardDraft(draft: PersonaDraft): WizardDraft {
  return { key: nextDraftKey(), values: draftToValues(draft), errors: [], message: null, busy: false }
}

function parseAge(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) return null
  const age = Number(value)
  return age >= PERSONA_MIN_AGE && age <= PERSONA_MAX_AGE ? age : null
}

function clampAge(value: number): number {
  return Math.min(PERSONA_MAX_AGE, Math.max(PERSONA_MIN_AGE, value))
}

export function OperatorWizard({
  countries,
  presets,
  languages,
  currentYear,
}: {
  countries: CountryOption[]
  presets: readonly PersonaCountryPreset[]
  languages: LanguageOption[]
  currentYear: number
}) {
  const [step, setStep] = useState<Step>('settings')
  const [count, setCount] = useState(5)
  const [selected, setSelected] = useState<string[]>([])
  const [ageMin, setAgeMin] = useState('22')
  const [ageMax, setAgeMax] = useState('34')
  const [genderMix, setGenderMix] = useState<PersonaGenderMix>('any')
  const [toneNote, setToneNote] = useState('')
  const [generating, setGenerating] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [missing, setMissing] = useState(0)
  const [drafts, setDrafts] = useState<WizardDraft[]>([])
  const [created, setCreated] = useState<CreatedAccount[]>([])
  const [photoNotice, setPhotoNotice] = useState<string | null>(null)
  const photoFiles = useRef(new Map<string, File>())
  const previews = useRef<string[]>([])
  const topRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const urls = previews.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  // Warn before leaving while drafts exist that were never created.
  useEffect(() => {
    if (step !== 'drafts' || drafts.length === 0) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [step, drafts.length])

  const goTo = (next: Step) => {
    setStep(next)
    setError(null)
    topRef.current?.scrollIntoView({ block: 'start' })
  }

  const minAge = parseAge(ageMin)
  const maxAge = parseAge(ageMax)
  const settingsProblem = selected.length === 0
    ? '나라를 하나 이상 고르세요.'
    : minAge === null || maxAge === null
      ? `나이는 ${PERSONA_MIN_AGE}-${PERSONA_MAX_AGE}세로 입력하세요.`
      : minAge > maxAge
        ? '최소 나이가 최대 나이보다 클 수 없습니다.'
        : null

  const toggleCountry = (code: string) => {
    setSelected(current => (current.includes(code) ? current.filter(value => value !== code) : [...current, code]))
  }

  const togglePreset = (preset: PersonaCountryPreset) => {
    setSelected(current => {
      const allSelected = preset.codes.every(code => current.includes(code))
      return allSelected
        ? current.filter(code => !preset.codes.includes(code))
        : [...current, ...preset.codes.filter(code => !current.includes(code))]
    })
  }

  const avoidLists = (exclude?: string) => {
    const others = drafts.filter(draft => draft.key !== exclude)
    return {
      avoidNames: others.map(draft => draft.values.name.trim()).filter(Boolean).slice(0, MAX_AVOID),
      avoidHandles: others.map(draft => draft.values.handle.trim()).filter(Boolean).slice(0, MAX_AVOID),
    }
  }

  const requestDrafts = (body: Record<string, unknown>) => sendJson<PersonaDraftsResponse>('/admin/operators/api/drafts', {
    genderMix,
    notes: toneNote.trim() || undefined,
    ...body,
  })

  const generate = async () => {
    if (settingsProblem || minAge === null || maxAge === null) return
    setGenerating(true)
    setError(null)
    const result = await requestDrafts({ count, countries: selected, ageMin: minAge, ageMax: maxAge })
    setGenerating(false)
    if (!result.ok) {
      setError(requestErrorMessage(result.error))
      return
    }
    setDrafts(result.data.drafts.map(toWizardDraft))
    setMissing(result.data.missing)
    setNotice(null)
    goTo('drafts')
  }

  const fillMissing = async () => {
    if (!missing || minAge === null || maxAge === null || selected.length === 0) return
    setGenerating(true)
    setError(null)
    const result = await requestDrafts({ count: missing, countries: selected, ageMin: minAge, ageMax: maxAge, ...avoidLists() })
    setGenerating(false)
    if (!result.ok) {
      setError(requestErrorMessage(result.error))
      return
    }
    setDrafts(current => [...current, ...result.data.drafts.map(toWizardDraft)])
    setMissing(result.data.missing)
  }

  const updateDraft = (key: string, patch: Partial<PersonaFieldValues>, fields: PersonaDraftField[]) => {
    setDrafts(current => current.map(draft => (draft.key === key
      ? {
        ...draft,
        values: { ...draft.values, ...patch },
        errors: draft.errors.filter(fieldError => !fields.includes(fieldError.field) && fieldError.field !== 'draft'),
        message: null,
      }
      : draft)))
  }

  const regenerate = async (key: string) => {
    const draft = drafts.find(candidate => candidate.key === key)
    if (!draft) return
    const birthYear = Number(draft.values.birthYear)
    const age = Number.isInteger(birthYear) && birthYear > 0 ? clampAge(currentYear - birthYear) : clampAge(minAge ?? 28)
    const country = draft.values.personaCountry || selected[0]
    if (!country) return
    setDrafts(current => current.map(candidate => (candidate.key === key ? { ...candidate, busy: true, message: null } : candidate)))
    const avoid = avoidLists(key)
    const result = await requestDrafts({
      count: 1,
      countries: [country],
      ageMin: age,
      ageMax: age,
      genderMix: draft.values.gender || 'any',
      avoidNames: [draft.values.name.trim(), ...avoid.avoidNames].filter(Boolean).slice(0, MAX_AVOID),
      avoidHandles: [draft.values.handle.trim(), ...avoid.avoidHandles].filter(Boolean).slice(0, MAX_AVOID),
    })
    const next = result.ok ? result.data.drafts[0] : undefined
    setDrafts(current => current.map(candidate => {
      if (candidate.key !== key) return candidate
      if (next) return { ...candidate, values: draftToValues(next), errors: [], message: null, busy: false }
      return { ...candidate, busy: false, message: result.ok ? requestErrorMessage('draft_generation_failed') : requestErrorMessage(result.error) }
    }))
  }

  const removeDraft = (key: string) => {
    setDrafts(current => current.filter(draft => draft.key !== key))
  }

  const createAll = async () => {
    if (!drafts.length || creating) return
    setCreating(true)
    setError(null)
    const batch = drafts
    const result = await sendJson<CreateOperatorsResponse>('/admin/operators/api/create', {
      drafts: batch.map(draft => valuesToDraftPayload(draft.values)),
    })
    setCreating(false)
    if (!result.ok) {
      setError(requestErrorMessage(result.error))
      return
    }
    const createdNow: CreatedAccount[] = []
    const remaining: WizardDraft[] = []
    for (const item of result.data.results) {
      const draft = batch[item.index]
      if (!draft) continue
      if (item.ok) {
        createdNow.push({
          userId: item.userId,
          name: draft.values.name.trim(),
          handle: item.handle,
          requestedHandle: item.requestedHandle,
          bioQueued: item.bioQueued,
          photoStatus: 'none',
          image: null,
          preview: null,
          photoError: null,
          hasFile: false,
        })
      } else {
        remaining.push({
          ...draft,
          errors: item.errors?.length ? item.errors : [],
          message: requestErrorMessage(item.error),
          busy: false,
        })
      }
    }
    setCreated(current => [...current, ...createdNow])
    setDrafts(remaining)
    if (!remaining.length) {
      goTo('photos')
      return
    }
    setNotice(createdNow.length
      ? `${createdNow.length}개를 만들었습니다. 아래 ${remaining.length}개를 고친 뒤 다시 만들어 주세요.`
      : `아래 ${remaining.length}개에 고칠 항목이 있습니다.`)
    topRef.current?.scrollIntoView({ block: 'start' })
  }

  const setAccount = (userId: string, patch: Partial<CreatedAccount>) => {
    setCreated(current => current.map(account => (account.userId === userId ? { ...account, ...patch } : account)))
  }

  const uploadPairs = async (pairs: { userId: string; file: File }[]) => {
    for (const pair of pairs) {
      const preview = URL.createObjectURL(pair.file)
      previews.current.push(preview)
      photoFiles.current.set(pair.userId, pair.file)
      setAccount(pair.userId, { photoStatus: 'queued', preview, photoError: null, hasFile: true })
    }
    // One request per photo, one at a time.
    for (const pair of pairs) {
      setAccount(pair.userId, { photoStatus: 'uploading' })
      const result = await uploadOperatorAvatar(pair.userId, pair.file)
      if (result.ok) setAccount(pair.userId, { photoStatus: 'done', image: result.data.image, photoError: null })
      else setAccount(pair.userId, { photoStatus: 'failed', photoError: requestErrorMessage(result.error) })
    }
  }

  const assignPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    const targets = created.filter(account => account.photoStatus === 'none' || account.photoStatus === 'failed')
    if (!targets.length) {
      setPhotoNotice('모든 계정에 사진이 있습니다. 바꾸려면 계정별 "바꾸기"를 누르세요.')
      return
    }
    const pairs = targets.slice(0, files.length).map((account, index) => ({ userId: account.userId, file: files[index] }))
    setPhotoNotice(files.length > targets.length
      ? `사진 ${files.length}장 중 ${targets.length}장만 사진 없는 계정에 차례대로 넣었습니다.`
      : `사진 ${pairs.length}장을 위에서부터 차례대로 넣습니다.`)
    void uploadPairs(pairs)
  }

  const pickOne = (userId: string) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadPairs([{ userId, file }])
  }

  const retryPhoto = (userId: string) => {
    const file = photoFiles.current.get(userId)
    if (file) void uploadPairs([{ userId, file }])
  }

  const uploading = created.some(account => account.photoStatus === 'queued' || account.photoStatus === 'uploading')

  const startOver = () => {
    setDrafts([])
    setCreated([])
    setMissing(0)
    setNotice(null)
    setPhotoNotice(null)
    photoFiles.current.clear()
    goTo('settings')
  }

  const stepIndex = STEPS.findIndex(item => item.id === step)

  return (
    <div ref={topRef} className="scroll-mt-4">
      <div className="flex items-center gap-2">
        <Link href="/admin/operators" className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 active:bg-slate-200" aria-label="운영 계정 목록으로">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-slate-900">운영 계정 만들기</h1>
      </div>

      <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="단계">
        {STEPS.map((item, index) => (
          <li
            key={item.id}
            aria-current={item.id === step ? 'step' : undefined}
            className={`rounded-lg px-2 py-1.5 text-center text-xs font-semibold ${index === stepIndex
              ? 'bg-sky-600 text-white'
              : index < stepIndex ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-500'}`}
          >
            {index + 1} {item.label}
          </li>
        ))}
      </ol>

      <div className="mt-3">
        <Notice tone="info">
          만든 계정은 앱에서 이름 옆에 항상 &lsquo;운영 계정&rsquo; 표시가 붙고, 대화방에도 Mingle 팀이 운영한다는 안내가 나옵니다.
        </Notice>
      </div>

      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}

      {step === 'settings' ? (
        <section className="mt-4 grid gap-5" aria-labelledby="wizard-settings-title">
          <h2 id="wizard-settings-title" className="sr-only">설정</h2>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-700" id="count-label">만들 개수</p>
            <div className="mt-2 flex items-center gap-3" role="group" aria-labelledby="count-label">
              <button type="button" className={`${SECONDARY_BUTTON} w-11 px-0`} onClick={() => setCount(value => Math.max(1, value - 1))} disabled={count <= 1} aria-label="하나 줄이기">
                <Minus className="h-5 w-5" aria-hidden="true" />
              </button>
              <output className="min-w-[3ch] text-center text-2xl font-bold tabular-nums text-slate-900" aria-live="polite">{count}</output>
              <button type="button" className={`${SECONDARY_BUTTON} w-11 px-0`} onClick={() => setCount(value => Math.min(PERSONA_MAX_DRAFTS, value + 1))} disabled={count >= PERSONA_MAX_DRAFTS} aria-label="하나 늘리기">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="text-sm text-slate-500">최대 {PERSONA_MAX_DRAFTS}개</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">나라</p>
              <span className="text-xs text-slate-500">{selected.length}개 선택</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {presets.map(preset => {
                const active = preset.codes.every(code => selected.includes(code))
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => togglePreset(preset)}
                    className={`${CHIP_BUTTON} ${active ? 'border-sky-600 bg-sky-600 text-white' : 'border-sky-200 bg-sky-50 text-sky-800'}`}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {countries.map(country => {
                const active = selected.includes(country.code)
                return (
                  <button
                    key={country.code}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleCountry(country.code)}
                    className={`${CHIP_BUTTON} ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                  >
                    {active ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <span aria-hidden="true">{country.flag}</span>}
                    {country.nameKo}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">고른 나라에 골고루 나눠 만들고, 도시는 그 나라 큰 도시 중에서 정합니다.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-700">나이 (올해 기준)</p>
            <div className="mt-2 flex items-center gap-2">
              <label className="sr-only" htmlFor="age-min">최소 나이</label>
              <input id="age-min" inputMode="numeric" pattern="[0-9]*" value={ageMin} onChange={event => setAgeMin(event.target.value.replace(/\D/g, '').slice(0, 2))} className="h-11 w-20 rounded-xl border border-slate-300 bg-white px-3 text-center text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" />
              <span className="text-slate-500">세 ~</span>
              <label className="sr-only" htmlFor="age-max">최대 나이</label>
              <input id="age-max" inputMode="numeric" pattern="[0-9]*" value={ageMax} onChange={event => setAgeMax(event.target.value.replace(/\D/g, '').slice(0, 2))} className="h-11 w-20 rounded-xl border border-slate-300 bg-white px-3 text-center text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" />
              <span className="text-slate-500">세</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">성인만 만들 수 있습니다 ({PERSONA_MIN_AGE}-{PERSONA_MAX_AGE}세). 나이는 앱 어디에도 보이지 않습니다.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-700">성별 구성 <span className="font-normal text-slate-400">(선택)</span></p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {GENDER_MIX_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={genderMix === option.value}
                  onClick={() => setGenderMix(option.value)}
                  className={`min-h-11 rounded-xl border px-2 text-sm font-medium ${genderMix === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="tone-note" className="text-sm font-medium text-slate-700">말투·분위기 메모 <span className="font-normal text-slate-400">(선택)</span></label>
              <span className="text-xs tabular-nums text-slate-400">{toneNote.length}/{PERSONA_TONE_NOTE_MAX_LENGTH}</span>
            </div>
            <textarea
              id="tone-note"
              value={toneNote}
              onChange={event => setToneNote(event.target.value)}
              maxLength={PERSONA_TONE_NOTE_MAX_LENGTH}
              rows={3}
              placeholder="예: 여행과 음악을 좋아하는 밝은 말투, 한국어를 배우는 중"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base leading-6 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>

          <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-slate-50/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur">
            {settingsProblem ? <p className="mb-2 text-center text-xs text-slate-500">{settingsProblem}</p> : null}
            <button type="button" className={PRIMARY_BUTTON} onClick={generate} disabled={Boolean(settingsProblem) || generating}>
              {generating ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
              {generating ? '초안 만드는 중… (최대 1분)' : `초안 ${count}개 만들기`}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'drafts' ? (
        <section className="mt-4 grid gap-3" aria-labelledby="wizard-drafts-title">
          <div className="flex items-center justify-between gap-2">
            <h2 id="wizard-drafts-title" className="text-base font-semibold text-slate-900">초안 {drafts.length}개</h2>
            <button type="button" className={SECONDARY_BUTTON} onClick={() => goTo('settings')} disabled={creating}>설정 바꾸기</button>
          </div>
          <p className="text-sm text-slate-500">모든 항목을 고칠 수 있습니다. 실제 인물·연예인 이름이나 어색한 소개가 없는지 확인하세요.</p>
          {created.length ? <Notice tone="success">이미 만든 계정 {created.length}개는 사진 단계에서 볼 수 있습니다.</Notice> : null}
          {notice ? <Notice tone="warning">{notice}</Notice> : null}
          {missing > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm text-amber-800">{missing}개는 만들지 못했습니다.</p>
              <button type="button" className={SECONDARY_BUTTON} onClick={fillMissing} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                빈 자리 채우기
              </button>
            </div>
          ) : null}

          {drafts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
              남은 초안이 없습니다.
            </div>
          ) : null}

          {drafts.map((draft, index) => {
            const country = countries.find(option => option.code === draft.values.personaCountry)
            return (
              <article key={draft.key} className="rounded-2xl border border-slate-200 bg-white p-4" aria-label={`초안 ${index + 1}`}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-500">#{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{country ? `${country.flag} ${country.nameKo}` : ''}</span>
                  <button type="button" className={SECONDARY_BUTTON} onClick={() => regenerate(draft.key)} disabled={draft.busy || creating}>
                    {draft.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                    다시 만들기
                  </button>
                  <button type="button" className={`${SECONDARY_BUTTON} w-11 px-0 text-rose-600`} onClick={() => removeDraft(draft.key)} disabled={draft.busy || creating} aria-label={`초안 ${index + 1} 지우기`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {draft.message ? <div className="mb-3"><Notice tone="error">{draft.message}</Notice></div> : null}
                <PersonaFields
                  idPrefix={draft.key}
                  values={draft.values}
                  onChange={(patch, fields) => updateDraft(draft.key, patch, fields)}
                  errors={draft.errors}
                  countries={countries}
                  languages={languages}
                  currentYear={currentYear}
                  showGender
                  disabled={draft.busy || creating}
                />
              </article>
            )
          })}

          <div className="sticky bottom-0 -mx-4 grid gap-2 border-t border-slate-200 bg-slate-50/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur">
            <button type="button" className={PRIMARY_BUTTON} onClick={createAll} disabled={!drafts.length || creating || drafts.some(draft => draft.busy)}>
              {creating ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}
              {creating ? '계정 만드는 중…' : `계정 ${drafts.length}개 만들기`}
            </button>
            {created.length ? (
              <button type="button" className={`${SECONDARY_BUTTON} w-full`} onClick={() => goTo('photos')} disabled={creating}>
                남은 초안은 두고 사진 추가로 가기
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 'photos' ? (
        <section className="mt-4 grid gap-3" aria-labelledby="wizard-photos-title">
          <h2 id="wizard-photos-title" className="text-base font-semibold text-slate-900">사진 추가</h2>
          <p className="text-sm text-slate-500">
            계정 {created.length}개를 만들었습니다. 사진을 여러 장 고르면 사진 없는 계정에 위에서부터 차례대로 들어갑니다. 사진은 정사각형으로 잘리고 위치 정보는 지워집니다.
          </p>
          <label className={`${PRIMARY_BUTTON} cursor-pointer`}>
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
            사진 여러 장 고르기
            <input type="file" accept={AVATAR_ACCEPT} multiple className="sr-only" onChange={assignPhotos} disabled={uploading} />
          </label>
          {photoNotice ? <Notice tone="info">{photoNotice}</Notice> : null}

          <ul className="grid gap-2">
            {created.map(account => (
              <li key={account.userId} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <OperatorAvatar image={account.image ?? account.preview} name={account.name} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-semibold text-slate-900">{account.name}</span>
                    <OperatorChip />
                  </div>
                  <p className="break-all text-sm text-slate-500">@{account.handle}</p>
                  {account.handle !== account.requestedHandle ? (
                    <p className="break-words text-xs text-amber-700">@{account.requestedHandle}은(는) 사용 중이라 바꿨습니다.</p>
                  ) : null}
                  <p className={`text-xs ${account.photoStatus === 'failed' ? 'text-rose-600' : 'text-slate-500'}`} aria-live="polite">
                    {account.photoStatus === 'none' ? '사진 없음'
                      : account.photoStatus === 'queued' ? '올릴 차례를 기다리는 중'
                        : account.photoStatus === 'uploading' ? '올리는 중…'
                          : account.photoStatus === 'done' ? '사진 완료' : account.photoError}
                  </p>
                </div>
                {account.photoStatus === 'failed' && account.hasFile ? (
                  <button type="button" className={SECONDARY_BUTTON} onClick={() => retryPhoto(account.userId)}>다시 시도</button>
                ) : (
                  <label className={`${SECONDARY_BUTTON} cursor-pointer ${account.photoStatus === 'queued' || account.photoStatus === 'uploading' ? 'pointer-events-none opacity-50' : ''}`}>
                    {account.photoStatus === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {account.image ? '바꾸기' : '고르기'}
                    <input
                      type="file"
                      accept={AVATAR_ACCEPT}
                      className="sr-only"
                      onChange={pickOne(account.userId)}
                      disabled={account.photoStatus === 'queued' || account.photoStatus === 'uploading'}
                      aria-label={`${account.name} 사진 고르기`}
                    />
                  </label>
                )}
              </li>
            ))}
          </ul>

          <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-slate-50/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur">
            <button type="button" className={PRIMARY_BUTTON} onClick={() => goTo('done')} disabled={uploading}>
              {uploading ? '사진 올리는 중…' : created.some(account => !account.image) ? '사진 없이 마치기' : '마치기'}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'done' ? (
        <section className="mt-4 grid gap-3" aria-labelledby="wizard-done-title">
          <h2 id="wizard-done-title" className="text-base font-semibold text-slate-900">완료</h2>
          <Notice tone="success">
            운영 계정 {created.length}개를 만들었습니다. 소개는 잠시 뒤 다른 언어로 자동 번역됩니다.
          </Notice>
          <ul className="grid gap-2">
            {created.map(account => (
              <li key={account.userId}>
                <Link href={`/admin/operators/${encodeURIComponent(account.userId)}`} className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:bg-slate-50">
                  <OperatorAvatar image={account.image} name={account.name} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-semibold text-slate-900">{account.name}</span>
                      <OperatorChip />
                    </span>
                    <span className="block break-all text-sm text-slate-500">@{account.handle}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/admin/operators" className={`${SECONDARY_BUTTON} h-12`}>목록으로</Link>
            <button type="button" className={`${SECONDARY_BUTTON} h-12`} onClick={startOver}>더 만들기</button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
