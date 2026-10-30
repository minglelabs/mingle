'use client'

import type { ReactNode } from 'react'
import {
  OPERATOR_BIO_MAX_LENGTH,
  OPERATOR_HANDLE_MAX_LENGTH,
  OPERATOR_NAME_MAX_LENGTH,
  PERSONA_MAX_AGE,
  PERSONA_MIN_AGE,
  type PersonaDraft,
  type PersonaDraftField,
  type PersonaFieldError,
  type PersonaGender,
} from '@/server/operators/persona-rules'
import { fieldErrorMessage } from '../_lib/copy'
import type { CountryOption, LanguageOption } from '../_lib/options'

/** Form state of one persona (text inputs keep strings until submit). */
export type PersonaFieldValues = {
  name: string
  handle: string
  personaCountry: string
  city: string
  birthYear: string
  primaryLanguage: string
  bio: string
  gender: '' | PersonaGender
}

export function draftToValues(draft: PersonaDraft): PersonaFieldValues {
  return {
    name: draft.name,
    handle: draft.handle,
    personaCountry: draft.personaCountry,
    city: draft.city,
    birthYear: String(draft.birthYear),
    primaryLanguage: draft.primaryLanguage,
    bio: draft.bio,
    gender: draft.gender ?? '',
  }
}

/** Body for the create endpoint; the server recomputes country name and coordinates. */
export function valuesToDraftPayload(values: PersonaFieldValues) {
  return {
    name: values.name,
    handle: values.handle,
    personaCountry: values.personaCountry,
    city: values.city,
    birthYear: Number(values.birthYear),
    primaryLanguage: values.primaryLanguage,
    bio: values.bio,
    gender: values.gender || null,
  }
}

const INPUT_CLASS = 'h-11 w-full min-w-0 rounded-xl border bg-white px-3 text-base text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100 disabled:text-slate-500'

function inputClass(hasError: boolean): string {
  return `${INPUT_CLASS} ${hasError ? 'border-rose-400' : 'border-slate-300'}`
}

function Field({
  id,
  label,
  hint,
  error,
  counter,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  counter?: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
        {counter ? <span className="shrink-0 text-xs tabular-nums text-slate-400">{counter}</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 break-words text-xs leading-4 text-rose-600">{fieldErrorMessage(error)}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 break-words text-xs leading-4 text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

export function PersonaFields({
  idPrefix,
  values,
  onChange,
  errors,
  countries,
  languages,
  currentYear,
  showGender = false,
  disabled = false,
}: {
  idPrefix: string
  values: PersonaFieldValues
  onChange: (patch: Partial<PersonaFieldValues>, fields: PersonaDraftField[]) => void
  errors: PersonaFieldError[]
  countries: CountryOption[]
  languages: LanguageOption[]
  currentYear: number
  showGender?: boolean
  disabled?: boolean
}) {
  const country = countries.find(option => option.code === values.personaCountry) ?? null
  const errorFor = (field: PersonaDraftField) => errors.find(error => error.field === field)?.error
  const describedBy = (field: PersonaDraftField, hasHint = false) => {
    const id = `${idPrefix}-${field}`
    return errorFor(field) ? `${id}-error` : hasHint ? `${id}-hint` : undefined
  }
  const birthYear = /^\d{4}$/.test(values.birthYear) ? Number(values.birthYear) : null
  const age = birthYear === null ? null : currentYear - birthYear
  const cities = country?.cities ?? []
  const cityIsListed = cities.includes(values.city)
  const commonLanguages = country ? languages.filter(option => country.languages.includes(option.code)) : []

  const changeCountry = (code: string) => {
    const next = countries.find(option => option.code === code)
    if (!next) return
    const primaryLanguage = next.languages.includes(values.primaryLanguage) ? values.primaryLanguage : next.languages[0]
    onChange({ personaCountry: code, city: next.cities[0] ?? '', primaryLanguage }, ['personaCountry', 'city', 'primaryLanguage'])
  }

  return (
    <div className="grid gap-3">
      <Field
        id={`${idPrefix}-name`}
        label="이름"
        error={errorFor('name')}
        counter={`${values.name.length}/${OPERATOR_NAME_MAX_LENGTH}`}
      >
        <input
          id={`${idPrefix}-name`}
          value={values.name}
          onChange={event => onChange({ name: event.target.value }, ['name'])}
          maxLength={OPERATOR_NAME_MAX_LENGTH}
          disabled={disabled}
          autoComplete="off"
          aria-invalid={Boolean(errorFor('name'))}
          aria-describedby={describedBy('name')}
          className={inputClass(Boolean(errorFor('name')))}
        />
      </Field>

      <Field
        id={`${idPrefix}-handle`}
        label="핸들"
        hint="영문 소문자·숫자·_·. 3-30자 (예: yuki.tnk)"
        error={errorFor('handle')}
      >
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-slate-400">@</span>
          <input
            id={`${idPrefix}-handle`}
            value={values.handle}
            onChange={event => onChange({ handle: event.target.value.trim().replace(/^@+/, '').toLowerCase() }, ['handle'])}
            maxLength={OPERATOR_HANDLE_MAX_LENGTH}
            disabled={disabled}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errorFor('handle'))}
            aria-describedby={describedBy('handle', true)}
            className={`${inputClass(Boolean(errorFor('handle')))} pl-7`}
          />
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id={`${idPrefix}-personaCountry`} label="나라" error={errorFor('personaCountry')}>
          <select
            id={`${idPrefix}-personaCountry`}
            value={country ? country.code : ''}
            onChange={event => changeCountry(event.target.value)}
            disabled={disabled}
            aria-invalid={Boolean(errorFor('personaCountry'))}
            aria-describedby={describedBy('personaCountry')}
            className={inputClass(Boolean(errorFor('personaCountry')))}
          >
            {!country ? <option value="">나라 선택</option> : null}
            {countries.map(option => (
              <option key={option.code} value={option.code}>{option.flag} {option.nameKo}</option>
            ))}
          </select>
        </Field>
        <Field id={`${idPrefix}-city`} label="도시" error={errorFor('city')}>
          <select
            id={`${idPrefix}-city`}
            value={values.city}
            onChange={event => onChange({ city: event.target.value }, ['city'])}
            disabled={disabled || !country}
            aria-invalid={Boolean(errorFor('city'))}
            aria-describedby={describedBy('city')}
            className={inputClass(Boolean(errorFor('city')))}
          >
            {!cityIsListed ? <option value={values.city}>{values.city || '도시 선택'}</option> : null}
            {cities.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id={`${idPrefix}-birthYear`}
          label="태어난 해"
          hint={age !== null ? `올해 ${age}세` : `${PERSONA_MIN_AGE}-${PERSONA_MAX_AGE}세`}
          error={errorFor('birthYear')}
        >
          <input
            id={`${idPrefix}-birthYear`}
            value={values.birthYear}
            onChange={event => onChange({ birthYear: event.target.value.replace(/\D/g, '').slice(0, 4) }, ['birthYear'])}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={String(currentYear - 28)}
            disabled={disabled}
            autoComplete="off"
            aria-invalid={Boolean(errorFor('birthYear'))}
            aria-describedby={describedBy('birthYear', true)}
            className={inputClass(Boolean(errorFor('birthYear')))}
          />
        </Field>
        <Field id={`${idPrefix}-primaryLanguage`} label="주 언어" error={errorFor('primaryLanguage')}>
          <select
            id={`${idPrefix}-primaryLanguage`}
            value={values.primaryLanguage}
            onChange={event => onChange({ primaryLanguage: event.target.value }, ['primaryLanguage'])}
            disabled={disabled}
            aria-invalid={Boolean(errorFor('primaryLanguage'))}
            aria-describedby={describedBy('primaryLanguage')}
            className={inputClass(Boolean(errorFor('primaryLanguage')))}
          >
            {!values.primaryLanguage ? <option value="">언어 선택</option> : null}
            {commonLanguages.length ? (
              <optgroup label="이 나라에서 흔한 언어">
                {commonLanguages.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
              </optgroup>
            ) : null}
            <optgroup label="모든 언어">
              {languages.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
            </optgroup>
          </select>
        </Field>
      </div>

      {showGender ? (
        <Field id={`${idPrefix}-gender`} label="성별" hint="이름을 만들 때만 쓰고 계정에는 저장하지 않습니다." error={errorFor('gender')}>
          <select
            id={`${idPrefix}-gender`}
            value={values.gender}
            onChange={event => onChange({ gender: event.target.value as PersonaFieldValues['gender'] }, ['gender'])}
            disabled={disabled}
            aria-describedby={describedBy('gender', true)}
            className={inputClass(Boolean(errorFor('gender')))}
          >
            <option value="">정하지 않음</option>
            <option value="female">여성</option>
            <option value="male">남성</option>
          </select>
        </Field>
      ) : null}

      <Field
        id={`${idPrefix}-bio`}
        label="소개"
        hint="주 언어로 씁니다. 저장하면 다른 언어로 자동 번역됩니다."
        error={errorFor('bio')}
        counter={`${values.bio.length}/${OPERATOR_BIO_MAX_LENGTH}`}
      >
        <textarea
          id={`${idPrefix}-bio`}
          value={values.bio}
          onChange={event => onChange({ bio: event.target.value }, ['bio'])}
          maxLength={OPERATOR_BIO_MAX_LENGTH}
          rows={3}
          disabled={disabled}
          aria-invalid={Boolean(errorFor('bio'))}
          aria-describedby={describedBy('bio', true)}
          className={`${inputClass(Boolean(errorFor('bio')))} h-auto min-h-[5.5rem] resize-y py-2.5 leading-6`}
        />
      </Field>
    </div>
  )
}
