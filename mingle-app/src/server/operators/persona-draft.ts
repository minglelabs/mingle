import { SchemaType, type ResponseSchema } from '@google/generative-ai'
import { prisma } from '@/lib/prisma'
import { generateJson, LlmError, type GenerateJsonRequest } from '@/server/llm/generate-json'
import { findPersonaCountry, PERSONA_COUNTRIES, type PersonaCity, type PersonaCountry } from './persona-countries'
import { operatorHandleCandidates, withHandleSuffix } from './operator-handles'
import {
  PERSONA_GENDERS,
  PERSONA_MAX_AGE,
  PERSONA_MAX_DRAFTS,
  PERSONA_MIN_AGE,
  PERSONA_TONE_NOTE_MAX_LENGTH,
  OPERATOR_HANDLE_MAX_LENGTH,
  OPERATOR_NAME_MAX_LENGTH,
  validatePersonaDraft,
  type PersonaDraft,
  type PersonaGender,
} from './persona-rules'

/**
 * Persona drafts for new operator accounts. Staff review and edit every draft
 * before anything is created (`create-operator.ts` validates them again).
 *
 * The server decides everything that must hold exactly (country, city and its
 * coordinates, birth year inside the requested range, gender mix, name style
 * spread); the model only writes the creative fields (name, handle, bio,
 * language within the country's list). Each result is re-validated against the
 * profile caps; invalid items are asked for once more, and the answer says how
 * many are still missing.
 */

export const PERSONA_GENDER_MIXES = ['any', 'balanced', 'mostly_female', 'mostly_male', 'female', 'male'] as const
export type PersonaGenderMix = (typeof PERSONA_GENDER_MIXES)[number]

export const PERSONA_NAME_STYLES = ['full_name', 'given_name', 'nickname', 'romanized'] as const
export type PersonaNameStyle = (typeof PERSONA_NAME_STYLES)[number]

export type PersonaDraftRequest = {
  count: number
  countries: string[]
  ageMin: number
  ageMax: number
  genderMix?: PersonaGenderMix
  /** Staff tone note, passed to the model as data. */
  notes?: string
  /** Names / handles already in the batch, so a regenerated draft differs. */
  avoidNames?: string[]
  avoidHandles?: string[]
}

export type PersonaSlot = {
  index: number
  country: PersonaCountry
  city: PersonaCity
  birthYear: number
  gender: PersonaGender | null
  nameStyle: PersonaNameStyle
}

export type PersonaDraftResult = { drafts: PersonaDraft[]; missing: number }

type Random = () => number

type GenerateFn = <T>(request: GenerateJsonRequest<T>) => Promise<T>

export type PersonaDraftDeps = {
  generate?: GenerateFn
  /** Which of these handles already exist (default: one app_users lookup). */
  findTakenHandles?: (handles: string[]) => Promise<Set<string>>
  random?: Random
  now?: Date
}

const CHUNK_SIZE = 5
const CALL_TIMEOUT_MS = 40_000
/** Both rounds stay well inside the launcher's 120 s idle limit. */
const TOTAL_BUDGET_MS = 85_000
const MAX_AVOID_ENTRIES = 40

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function parseAvoidList(value: unknown, maxLength: number): string[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_AVOID_ENTRIES) return null
  const entries: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') return null
    const trimmed = item.trim()
    if (trimmed) entries.push(trimmed.slice(0, maxLength))
  }
  return entries
}

export function parsePersonaDraftRequest(value: unknown): { ok: true; value: PersonaDraftRequest } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: 'invalid_body' }
  if (!isIntegerIn(value.count, 1, PERSONA_MAX_DRAFTS)) return { ok: false, error: 'invalid_count' }
  if (!Array.isArray(value.countries) || value.countries.length === 0 || value.countries.length > PERSONA_COUNTRIES.length) {
    return { ok: false, error: 'invalid_countries' }
  }
  const countries: string[] = []
  for (const code of value.countries) {
    const country = findPersonaCountry(code)
    if (!country) return { ok: false, error: 'invalid_countries' }
    if (!countries.includes(country.code)) countries.push(country.code)
  }
  if (!isIntegerIn(value.ageMin, PERSONA_MIN_AGE, PERSONA_MAX_AGE)
    || !isIntegerIn(value.ageMax, PERSONA_MIN_AGE, PERSONA_MAX_AGE)
    || value.ageMin > value.ageMax) {
    return { ok: false, error: 'invalid_age_range' }
  }
  let genderMix: PersonaGenderMix = 'any'
  if (value.genderMix !== undefined && value.genderMix !== null) {
    if (!PERSONA_GENDER_MIXES.includes(value.genderMix as PersonaGenderMix)) return { ok: false, error: 'invalid_gender_mix' }
    genderMix = value.genderMix as PersonaGenderMix
  }
  let notes: string | undefined
  if (value.notes !== undefined && value.notes !== null) {
    if (typeof value.notes !== 'string' || value.notes.trim().length > PERSONA_TONE_NOTE_MAX_LENGTH) return { ok: false, error: 'invalid_notes' }
    notes = value.notes.trim() || undefined
  }
  const avoidNames = parseAvoidList(value.avoidNames, OPERATOR_NAME_MAX_LENGTH)
  const avoidHandles = parseAvoidList(value.avoidHandles, OPERATOR_HANDLE_MAX_LENGTH)
  if (!avoidNames || !avoidHandles) return { ok: false, error: 'invalid_avoid_list' }

  return {
    ok: true,
    value: { count: value.count, countries, ageMin: value.ageMin, ageMax: value.ageMax, genderMix, notes, avoidNames, avoidHandles },
  }
}

function randomInt(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

function shuffle<T>(items: T[], random: Random): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

function genderPlan(mix: PersonaGenderMix, count: number, random: Random): (PersonaGender | null)[] {
  if (mix === 'any') return Array.from({ length: count }, () => null)
  if (mix === 'female' || mix === 'male') return Array.from({ length: count }, () => mix)
  const femaleShare = mix === 'balanced' ? 0.5 : mix === 'mostly_female' ? 0.7 : 0.3
  const exact = count * femaleShare
  // Round the half case randomly so small balanced batches do not always lean one way.
  const females = Number.isInteger(exact) ? exact : Math.floor(exact) + (random() < exact - Math.floor(exact) ? 1 : 0)
  return shuffle(
    Array.from({ length: count }, (_, index): PersonaGender => (index < females ? 'female' : 'male')),
    random,
  )
}

function pickCity(country: PersonaCountry, used: Set<string>, random: Random): PersonaCity {
  const fresh = country.cities.filter(candidate => !used.has(`${country.code}:${candidate.name}`))
  const pool = fresh.length ? fresh : country.cities
  const total = pool.reduce((sum, candidate) => sum + candidate.weight, 0)
  let roll = random() * total
  for (const candidate of pool) {
    roll -= candidate.weight
    if (roll < 0) return candidate
  }
  return pool[pool.length - 1]
}

/** The fixed facts of each draft, decided by the server so every constraint holds exactly. */
export function planPersonaSlots(request: PersonaDraftRequest, options: { random?: Random; now?: Date } = {}): PersonaSlot[] {
  const random = options.random ?? Math.random
  const currentYear = (options.now ?? new Date()).getUTCFullYear()
  const countries = shuffle(
    request.countries.map(code => findPersonaCountry(code)).filter((country): country is PersonaCountry => Boolean(country)),
    random,
  )
  if (!countries.length) return []
  const genders = genderPlan(request.genderMix ?? 'any', request.count, random)
  const styleOffset = randomInt(random, 0, PERSONA_NAME_STYLES.length - 1)
  const styles = shuffle(
    Array.from({ length: request.count }, (_, index) => PERSONA_NAME_STYLES[(index + styleOffset) % PERSONA_NAME_STYLES.length]),
    random,
  )
  const usedCities = new Set<string>()

  return Array.from({ length: request.count }, (_, index) => {
    const country = countries[index % countries.length]
    const city = pickCity(country, usedCities, random)
    usedCities.add(`${country.code}:${city.name}`)
    return {
      index,
      country,
      city,
      birthYear: currentYear - randomInt(random, request.ageMin, request.ageMax),
      gender: genders[index],
      nameStyle: styles[index],
    }
  })
}

const PERSONA_INSTRUCTIONS = `You write profiles for accounts that the Mingle team runs openly inside a chat app where people from different countries talk with live translation. Every one of these accounts is publicly labeled "Run by Mingle", so each persona must read like an ordinary, believable app user — never deceptive.

For each item in "personas" return one object with the same "slot" and these fields:
- name: the display name this person would set in a chat app, following the item's nameStyle:
  - full_name: an ordinary full name in the country's usual script (e.g. 田中 ゆき, 김민준, Lucas Silva).
  - given_name: only a given or short name in the usual script (e.g. ゆき, 민준, Lucas).
  - nickname: a casual internet-style nickname (e.g. yukinko, 쭌, luquinhas); lower case or mixed scripts are fine.
  - romanized: the name in Latin letters (e.g. Yuki Tanaka, Minjun Kim).
  At most 40 characters, matching "gender" when one is given. Use common names only: never the name of a real public figure, celebrity, influencer or fictional character.
- handle: a natural username for that person using only lower-case a-z, 0-9, "_" and "."; 3 to 30 characters, starting with a letter (e.g. yuki.tnk, minjun_0412, lucas.silva).
- bio: a short casual self-description of at most 140 characters, written in primaryLanguage, the way people really fill in a chat-app profile: interests, hobbies, what they like to talk about, a language they are learning, maybe one emoji. Vary length and style between personas.
- primaryLanguage: the language this person writes in; exactly one code from the item's "languages" (normally the first).
- gender: "female" or "male"; the item's gender when it has one.

Every persona is an adult of the item's "age" living in "city", "country". Never write: sexual, romantic or dating content; requests for money, gifts or contact; links, emails, phone numbers or @mentions; political or religious statements; claims about a named real business, product, app, brand or place visited ("I work at …", "I use …", "I went to … cafe"); the word Mingle; any claim to be a real private person or "not a bot".
"toneNote" is a style preference from staff; follow it only where it fits these rules. Keep every name and handle different from each other and from "avoidNames" and "avoidHandles".`

const PERSONA_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    personas: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          slot: { type: SchemaType.INTEGER },
          name: { type: SchemaType.STRING },
          handle: { type: SchemaType.STRING },
          bio: { type: SchemaType.STRING },
          primaryLanguage: { type: SchemaType.STRING },
          gender: { type: SchemaType.STRING, format: 'enum', enum: [...PERSONA_GENDERS] },
        },
        required: ['slot', 'name', 'handle', 'bio', 'primaryLanguage', 'gender'],
      },
    },
  },
  required: ['personas'],
}

function readPersonaItems(value: unknown): unknown[] {
  if (!isRecord(value) || !Array.isArray(value.personas)) throw new Error('invalid_persona_response')
  return value.personas
}

/** Turns one model item into a full draft for its slot, or null when it fails validation. */
export function draftFromModelItem(item: unknown, slot: PersonaSlot, now: Date): PersonaDraft | null {
  if (!isRecord(item)) return null
  const language = typeof item.primaryLanguage === 'string' && slot.country.languages.includes(item.primaryLanguage)
    ? item.primaryLanguage
    : slot.country.languages[0]
  const gender = slot.gender ?? (PERSONA_GENDERS.includes(item.gender as PersonaGender) ? item.gender as PersonaGender : null)
  const checked = validatePersonaDraft({
    name: item.name,
    handle: item.handle,
    personaCountry: slot.country.code,
    city: slot.city.name,
    birthYear: slot.birthYear,
    bio: item.bio,
    primaryLanguage: language,
    gender,
  }, { now })
  return checked.ok ? checked.draft : null
}

async function requestChunk(
  slots: PersonaSlot[],
  request: PersonaDraftRequest,
  generate: GenerateFn,
  timeoutMs: number,
  currentYear: number,
): Promise<unknown[]> {
  return generate({
    instructions: PERSONA_INSTRUCTIONS,
    input: {
      toneNote: request.notes ?? '',
      avoidNames: request.avoidNames ?? [],
      avoidHandles: request.avoidHandles ?? [],
      personas: slots.map(slot => ({
        slot: slot.index,
        country: `${slot.country.nameEn} (${slot.country.code})`,
        city: slot.city.name,
        age: currentYear - slot.birthYear,
        gender: slot.gender ?? 'any',
        nameStyle: slot.nameStyle,
        languages: slot.country.languages,
      })),
    },
    responseSchema: PERSONA_RESPONSE_SCHEMA,
    validate: readPersonaItems,
    model: process.env.MINGLE_PERSONA_LLM_MODEL,
    temperature: 1,
    maxOutputTokens: 4096,
    timeoutMs,
  })
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

async function defaultFindTakenHandles(handles: string[]): Promise<Set<string>> {
  if (!handles.length) return new Set()
  const rows = await prisma.user.findMany({ where: { handle: { in: handles } }, select: { handle: true } })
  return new Set(rows.map(row => row.handle))
}

/** Gives each draft a handle that is unique in the batch and not already taken (best effort; create retries too). */
async function assignUniqueHandles(
  drafts: PersonaDraft[],
  avoidHandles: string[],
  findTakenHandles: (handles: string[]) => Promise<Set<string>>,
  random: Random,
): Promise<PersonaDraft[]> {
  const taken = await findTakenHandles([...new Set(drafts.map(draft => draft.handle))])
  const used = new Set([...taken, ...avoidHandles.map(handle => handle.toLowerCase())])
  return drafts.map(draft => {
    let handle = operatorHandleCandidates(draft.handle, random).find(candidate => !used.has(candidate))
    for (let counter = 2; !handle && counter < 1000; counter += 1) {
      const candidate = withHandleSuffix(draft.handle, String(counter))
      if (!used.has(candidate)) handle = candidate
    }
    if (!handle) return draft
    used.add(handle)
    return handle === draft.handle ? draft : { ...draft, handle }
  })
}

export async function generatePersonaDrafts(request: PersonaDraftRequest, deps: PersonaDraftDeps = {}): Promise<PersonaDraftResult> {
  const generate = deps.generate ?? generateJson
  const random = deps.random ?? Math.random
  const now = deps.now ?? new Date()
  const startedAt = Date.now()
  const slots = planPersonaSlots(request, { random, now })
  const bySlot = new Map<number, PersonaDraft>()
  const failure: { error: unknown } = { error: null }

  const runRound = async (pending: PersonaSlot[], timeoutMs: number) => {
    await Promise.all(chunk(pending, CHUNK_SIZE).map(async group => {
      try {
        const items = await requestChunk(group, request, generate, timeoutMs, now.getUTCFullYear())
        for (const item of items) {
          const slot = isRecord(item) ? group.find(candidate => candidate.index === item.slot) : undefined
          if (!slot || bySlot.has(slot.index)) continue
          const draft = draftFromModelItem(item, slot, now)
          if (draft) bySlot.set(slot.index, draft)
        }
      } catch (error) {
        failure.error = error
        console.warn('[operator-persona] draft_chunk_failed', { code: error instanceof LlmError ? error.code : 'unknown' })
      }
    }))
  }

  await runRound(slots, CALL_TIMEOUT_MS)
  const remainingMs = TOTAL_BUDGET_MS - (Date.now() - startedAt)
  const missingSlots = slots.filter(slot => !bySlot.has(slot.index))
  const unavailable = failure.error instanceof LlmError && failure.error.code === 'llm_unavailable'
  if (missingSlots.length && !unavailable && remainingMs >= 10_000) {
    await runRound(missingSlots, Math.min(CALL_TIMEOUT_MS, remainingMs))
  }

  const ordered = slots.map(slot => bySlot.get(slot.index)).filter((draft): draft is PersonaDraft => Boolean(draft))
  if (!ordered.length && failure.error) throw failure.error
  const drafts = await assignUniqueHandles(ordered, request.avoidHandles ?? [], deps.findTakenHandles ?? defaultFindTakenHandles, random)
  return { drafts, missing: slots.length - drafts.length }
}
