import { HANDLE_MAX_LENGTH, isSearchExcludedHandle, normalizeHandle } from '@/lib/handles'
import { canonicalizeSttLanguageCode } from '@/lib/stt-languages'
import { findPersonaCity, findPersonaCountry, type PersonaCity, type PersonaCountry } from './persona-countries'

/**
 * Validation for operator personas: generated drafts, the drafts staff edit
 * before creating accounts, and later edits. Pure (no server imports), so it
 * runs the same way everywhere. Text caps match the profile PATCH
 * (`src/app/api/profile/route.ts`: name 40, bio 160, location label 120,
 * coordinates rounded to 2 dp); the rest are stricter persona rules.
 */

export const OPERATOR_NAME_MAX_LENGTH = 40
export const OPERATOR_BIO_MAX_LENGTH = 160
export const OPERATOR_HANDLE_MIN_LENGTH = 3
export const OPERATOR_HANDLE_MAX_LENGTH = HANDLE_MAX_LENGTH
export const OPERATOR_NOTES_MAX_LENGTH = 1000
export const PERSONA_MIN_AGE = 20
export const PERSONA_MAX_AGE = 80
export const PERSONA_MAX_DRAFTS = 20
export const PERSONA_TONE_NOTE_MAX_LENGTH = 300

export const PERSONA_GENDERS = ['female', 'male'] as const
export type PersonaGender = (typeof PERSONA_GENDERS)[number]

export type PersonaDraft = {
  name: string
  handle: string
  /** ISO 3166-1 alpha-2, upper case. Staff-only (`app_operator_accounts.persona_country`). */
  personaCountry: string
  birthYear: number
  /** English city name from the persona country table. */
  city: string
  /** English country name, stored as `locationCountry`. */
  countryName: string
  latitude: number
  longitude: number
  /** Empty when the account has no bio. */
  bio: string
  primaryLanguage: string
  /** Steers the generated name only; not stored on the account. */
  gender?: PersonaGender | null
}

export type PersonaDraftField =
  | 'draft' | 'name' | 'handle' | 'personaCountry' | 'city' | 'birthYear' | 'bio' | 'primaryLanguage' | 'gender' | 'notes'

export type PersonaFieldError = { field: PersonaDraftField; error: string }

type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string }

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/
const LINE_BREAKS = /[\r\n\u2028\u2029]/
const URL_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|me|co|app|kr|jp|ly|gg|link|xyz)\b)/i
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/
const MENTION_PATTERN = /(^|\s)@[\p{L}\p{N}_.]{2,}/u
const DIGIT_RUN_PATTERN = /[+(]?\d[\d\s().-]*\d/g
const PHONE_MIN_DIGITS = 9
const MINGLE_PATTERN = /mingle|밍글|ミングル/i
/** Whole words (so "Badminton" is fine) that would make a persona read as staff or as the brand. */
const RESERVED_WORDS = new Set(['mingle', 'admin', 'administrator', 'official', 'staff', 'support', 'operator', 'moderator', 'system'])
const RESERVED_NAME_FRAGMENTS = /밍글|ミングル|관리자|운영|공식|스태프/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasReservedWord(text: string): boolean {
  return text.toLowerCase().split(/[^\p{L}]+/u).some(word => RESERVED_WORDS.has(word))
}

function hasPhoneNumber(text: string): boolean {
  for (const run of text.match(DIGIT_RUN_PATTERN) ?? []) {
    if (run.replace(/\D/g, '').length >= PHONE_MIN_DIGITS) return true
  }
  return false
}

/** Links, emails, phone numbers or @mentions: an operator persona never hands out contact details. */
export function hasContactDetails(text: string): boolean {
  return URL_PATTERN.test(text) || EMAIL_PATTERN.test(text) || MENTION_PATTERN.test(text) || hasPhoneNumber(text)
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100
}

export function validateOperatorName(value: unknown): FieldResult<string> {
  if (typeof value !== 'string') return { ok: false, error: 'invalid_name' }
  if (LINE_BREAKS.test(value.trim()) || CONTROL_CHARACTERS.test(value)) return { ok: false, error: 'invalid_name' }
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name) return { ok: false, error: 'name_required' }
  if (name.length > OPERATOR_NAME_MAX_LENGTH) return { ok: false, error: 'name_too_long' }
  if (!/\p{L}/u.test(name)) return { ok: false, error: 'invalid_name' }
  if (name.includes('@') || URL_PATTERN.test(name)) return { ok: false, error: 'invalid_name' }
  if (hasReservedWord(name) || RESERVED_NAME_FRAGMENTS.test(name)) return { ok: false, error: 'reserved_name' }
  return { ok: true, value: name }
}

/**
 * The app's handle rule (`normalizeHandle`: `[a-z0-9_.]`, <= 30, lower-cased)
 * plus persona rules: at least 3 characters with a letter, starts with a letter
 * or digit, no trailing or doubled dot, and nothing that reads as staff or as a
 * handle search hides (`admin`, `anon_…`).
 */
export function validateOperatorHandle(value: unknown): FieldResult<string> {
  const raw = typeof value === 'string' ? value.trim().replace(/^@+/, '') : value
  const normalized = normalizeHandle(raw)
  if (!normalized.valid || !normalized.value) return { ok: false, error: 'invalid_handle' }
  const handle = normalized.value
  if (handle.length < OPERATOR_HANDLE_MIN_LENGTH) return { ok: false, error: 'handle_too_short' }
  if (!/^[a-z0-9]/.test(handle) || !/[a-z]/.test(handle) || handle.endsWith('.') || handle.includes('..')) {
    return { ok: false, error: 'invalid_handle' }
  }
  if (isSearchExcludedHandle(handle) || handle.includes('mingle') || hasReservedWord(handle)) {
    return { ok: false, error: 'reserved_handle' }
  }
  return { ok: true, value: handle }
}

/** Empty -> null (no bio). */
export function validateOperatorBio(value: unknown): FieldResult<string | null> {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: 'invalid_bio' }
  const bio = value.replace(/\r\n?/g, '\n').trim()
  if (!bio) return { ok: true, value: null }
  if (bio.length > OPERATOR_BIO_MAX_LENGTH) return { ok: false, error: 'bio_too_long' }
  if (CONTROL_CHARACTERS.test(bio)) return { ok: false, error: 'invalid_bio' }
  if (hasContactDetails(bio)) return { ok: false, error: 'bio_contact_details' }
  if (MINGLE_PATTERN.test(bio)) return { ok: false, error: 'bio_mentions_mingle' }
  return { ok: true, value: bio }
}

export function personaAgeThisYear(birthYear: number, now = new Date()): number {
  return now.getUTCFullYear() - birthYear
}

/** Adults only: the persona turns at least 20 this year and at most 80. */
export function validatePersonaBirthYear(value: unknown, now = new Date()): FieldResult<number> {
  const year = typeof value === 'string' && /^\d{4}$/.test(value.trim()) ? Number(value.trim()) : value
  if (typeof year !== 'number' || !Number.isInteger(year)) return { ok: false, error: 'invalid_birth_year' }
  const age = personaAgeThisYear(year, now)
  if (age < PERSONA_MIN_AGE) return { ok: false, error: 'too_young' }
  if (age > PERSONA_MAX_AGE) return { ok: false, error: 'invalid_birth_year' }
  return { ok: true, value: year }
}

export function validatePersonaLanguage(value: unknown): FieldResult<string> {
  const language = typeof value === 'string' ? canonicalizeSttLanguageCode(value) : ''
  return language ? { ok: true, value: language } : { ok: false, error: 'invalid_language' }
}

export function validatePersonaGender(value: unknown): FieldResult<PersonaGender | null> {
  if (value === null || value === undefined || value === '') return { ok: true, value: null }
  return PERSONA_GENDERS.includes(value as PersonaGender)
    ? { ok: true, value: value as PersonaGender }
    : { ok: false, error: 'invalid_gender' }
}

/** Staff-only notes; empty -> null. */
export function validateOperatorNotes(value: unknown): FieldResult<string | null> {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: 'invalid_notes' }
  const notes = value.replace(/\r\n?/g, '\n').trim()
  if (notes.length > OPERATOR_NOTES_MAX_LENGTH) return { ok: false, error: 'notes_too_long' }
  return { ok: true, value: notes || null }
}

export type PersonaLocation = { country: PersonaCountry; city: PersonaCity }

export function resolvePersonaLocation(
  countryCode: unknown,
  cityName: unknown,
): { ok: true; value: PersonaLocation } | { ok: false; errors: PersonaFieldError[] } {
  const country = findPersonaCountry(countryCode)
  if (!country) return { ok: false, errors: [{ field: 'personaCountry', error: 'invalid_country' }] }
  const city = findPersonaCity(country, cityName)
  if (!city) return { ok: false, errors: [{ field: 'city', error: 'invalid_city' }] }
  return { ok: true, value: { country, city } }
}

/** The stored location of a persona: always the table city, never browser/model coordinates. */
export function personaLocationFields(location: PersonaLocation) {
  return {
    personaCountry: location.country.code,
    city: location.city.name,
    countryName: location.country.nameEn,
    latitude: roundCoordinate(location.city.latitude),
    longitude: roundCoordinate(location.city.longitude),
  }
}

export type PersonaDraftValidation = { ok: true; draft: PersonaDraft } | { ok: false; errors: PersonaFieldError[] }

/**
 * Checks every field of a draft (generated or staff-edited) and returns the
 * normalized draft. Country name and coordinates are recomputed from the
 * table, so values sent by a client are never trusted.
 */
export function validatePersonaDraft(value: unknown, options: { now?: Date } = {}): PersonaDraftValidation {
  if (!isRecord(value)) return { ok: false, errors: [{ field: 'draft', error: 'invalid_draft' }] }
  const now = options.now ?? new Date()
  const errors: PersonaFieldError[] = []

  const name = validateOperatorName(value.name)
  if (!name.ok) errors.push({ field: 'name', error: name.error })
  const handle = validateOperatorHandle(value.handle)
  if (!handle.ok) errors.push({ field: 'handle', error: handle.error })
  const location = resolvePersonaLocation(value.personaCountry, value.city)
  if (!location.ok) errors.push(...location.errors)
  const birthYear = validatePersonaBirthYear(value.birthYear, now)
  if (!birthYear.ok) errors.push({ field: 'birthYear', error: birthYear.error })
  const bio = validateOperatorBio(value.bio)
  if (!bio.ok) errors.push({ field: 'bio', error: bio.error })
  const language = validatePersonaLanguage(value.primaryLanguage)
  if (!language.ok) errors.push({ field: 'primaryLanguage', error: language.error })
  const gender = validatePersonaGender(value.gender)
  if (!gender.ok) errors.push({ field: 'gender', error: gender.error })

  if (!name.ok || !handle.ok || !location.ok || !birthYear.ok || !bio.ok || !language.ok || !gender.ok) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    draft: {
      name: name.value,
      handle: handle.value,
      ...personaLocationFields(location.value),
      birthYear: birthYear.value,
      bio: bio.value ?? '',
      primaryLanguage: language.value,
      gender: gender.value,
    },
  }
}

export type OperatorPatch = {
  name?: string
  handle?: string
  bio?: string | null
  primaryLanguage?: string
  birthYear?: number
  location?: PersonaLocation
  notes?: string | null
}

function has(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

/**
 * A partial edit of an operator account. `personaCountry` and `city` travel
 * together (a city is only valid for its own country).
 */
export function parseOperatorPatch(
  value: unknown,
  options: { now?: Date } = {},
): { ok: true; patch: OperatorPatch } | { ok: false; errors: PersonaFieldError[] } {
  if (!isRecord(value)) return { ok: false, errors: [{ field: 'draft', error: 'invalid_body' }] }
  const now = options.now ?? new Date()
  const patch: OperatorPatch = {}
  const errors: PersonaFieldError[] = []

  if (has(value, 'name')) {
    const name = validateOperatorName(value.name)
    if (name.ok) patch.name = name.value
    else errors.push({ field: 'name', error: name.error })
  }
  if (has(value, 'handle')) {
    const handle = validateOperatorHandle(value.handle)
    if (handle.ok) patch.handle = handle.value
    else errors.push({ field: 'handle', error: handle.error })
  }
  if (has(value, 'bio')) {
    const bio = validateOperatorBio(value.bio)
    if (bio.ok) patch.bio = bio.value
    else errors.push({ field: 'bio', error: bio.error })
  }
  if (has(value, 'primaryLanguage')) {
    const language = validatePersonaLanguage(value.primaryLanguage)
    if (language.ok) patch.primaryLanguage = language.value
    else errors.push({ field: 'primaryLanguage', error: language.error })
  }
  if (has(value, 'birthYear')) {
    const birthYear = validatePersonaBirthYear(value.birthYear, now)
    if (birthYear.ok) patch.birthYear = birthYear.value
    else errors.push({ field: 'birthYear', error: birthYear.error })
  }
  if (has(value, 'personaCountry') || has(value, 'city')) {
    const location = resolvePersonaLocation(value.personaCountry, value.city)
    if (location.ok) patch.location = location.value
    else errors.push(...location.errors)
  }
  if (has(value, 'notes')) {
    const notes = validateOperatorNotes(value.notes)
    if (notes.ok) patch.notes = notes.value
    else errors.push({ field: 'notes', error: notes.error })
  }

  if (errors.length) return { ok: false, errors }
  if (!Object.keys(patch).length) return { ok: false, errors: [{ field: 'draft', error: 'no_fields_to_update' }] }
  return { ok: true, patch }
}
