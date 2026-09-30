import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findMany: vi.fn(async () => []) } } }))

import type { GenerateJsonRequest } from '@/server/llm/generate-json'
import { LlmError } from '@/server/llm/generate-json'
import { generatePersonaDrafts, parsePersonaDraftRequest, planPersonaSlots, type PersonaDraftDeps, type PersonaDraftRequest } from './persona-draft'
import { findPersonaCountry } from './persona-countries'

const NOW = new Date('2026-09-30T00:00:00Z')

/** Deterministic Park-Miller sequence in [0, 1). */
function seeded(seed = 7): () => number {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

type ModelPersona = { slot: number; country: string; city: string; age: number; gender: string; nameStyle: string; languages: string[] }
type ModelInput = { toneNote: string; avoidNames: string[]; avoidHandles: string[]; personas: ModelPersona[] }

/** A fake model: answers every slot with valid content unless `override` changes an item. */
function fakeModel(override?: (persona: ModelPersona, call: number) => Record<string, unknown> | null) {
  let calls = 0
  const spy = vi.fn(async (request: GenerateJsonRequest<unknown>): Promise<unknown> => {
    calls += 1
    const input = request.input as ModelInput
    const personas = input.personas.map(persona => {
      const base = {
        slot: persona.slot,
        name: `Aoi ${persona.slot}`,
        handle: `aoi.${persona.slot}`,
        bio: 'Coffee, films and weekend walks ☕',
        primaryLanguage: persona.languages[0],
        gender: 'female',
      }
      return override ? override(persona, calls) ?? base : base
    })
    return request.validate({ personas })
  })
  // vi.fn drops the generic signature of the injected generator; restore it for the deps type.
  return spy as typeof spy & NonNullable<PersonaDraftDeps['generate']>
}

const REQUEST: PersonaDraftRequest = { count: 6, countries: ['JP', 'BR'], ageMin: 22, ageMax: 30, genderMix: 'any', avoidNames: [], avoidHandles: [] }

describe('parsePersonaDraftRequest', () => {
  it('normalizes a valid request', () => {
    expect(parsePersonaDraftRequest({ count: 3, countries: ['jp', 'JP', 'br'], ageMin: 20, ageMax: 80, notes: '  bright  ' })).toEqual({
      ok: true,
      value: { count: 3, countries: ['JP', 'BR'], ageMin: 20, ageMax: 80, genderMix: 'any', notes: 'bright', avoidNames: [], avoidHandles: [] },
    })
  })

  it.each([
    [{ count: 0 }, 'invalid_count'],
    [{ count: 21 }, 'invalid_count'],
    [{ count: 1.5 }, 'invalid_count'],
    [{ countries: [] }, 'invalid_countries'],
    [{ countries: ['ZZ'] }, 'invalid_countries'],
    [{ ageMin: 19 }, 'invalid_age_range'],
    [{ ageMin: 40, ageMax: 30 }, 'invalid_age_range'],
    [{ genderMix: 'robots' }, 'invalid_gender_mix'],
    [{ notes: 'n'.repeat(301) }, 'invalid_notes'],
    [{ avoidHandles: Array.from({ length: 41 }, (_, index) => `h${index}`) }, 'invalid_avoid_list'],
  ])('rejects %o', (patch, error) => {
    expect(parsePersonaDraftRequest({ count: 3, countries: ['JP'], ageMin: 22, ageMax: 30, ...patch })).toEqual({ ok: false, error })
  })
})

describe('planPersonaSlots', () => {
  it('spreads countries evenly and keeps ages inside the range with cities of that country', () => {
    const slots = planPersonaSlots({ ...REQUEST, count: 10 }, { random: seeded(), now: NOW })
    expect(slots).toHaveLength(10)
    expect(slots.filter(slot => slot.country.code === 'JP')).toHaveLength(5)
    for (const slot of slots) {
      const age = 2026 - slot.birthYear
      expect(age).toBeGreaterThanOrEqual(22)
      expect(age).toBeLessThanOrEqual(30)
      expect(findPersonaCountry(slot.country.code)!.cities).toContain(slot.city)
    }
    expect(new Set(slots.map(slot => slot.nameStyle)).size).toBe(4)
  })

  it('follows the gender mix exactly', () => {
    const gendersFor = (genderMix: PersonaDraftRequest['genderMix'], count = 10) => planPersonaSlots({ ...REQUEST, count, genderMix }, { random: seeded(3), now: NOW }).map(slot => slot.gender)
    expect(gendersFor('balanced').filter(gender => gender === 'female')).toHaveLength(5)
    expect(gendersFor('mostly_female').filter(gender => gender === 'female')).toHaveLength(7)
    expect(gendersFor('male').every(gender => gender === 'male')).toBe(true)
    expect(gendersFor('any').every(gender => gender === null)).toBe(true)
  })
})

describe('generatePersonaDrafts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds validated drafts where the server decides country, city and birth year', async () => {
    const generate = fakeModel(persona => (persona.slot === 0 ? { slot: 0, name: 'Aoi', handle: 'aoi.zero', bio: 'hi', primaryLanguage: 'ko', gender: 'male' } : null))
    const result = await generatePersonaDrafts(REQUEST, { generate, random: seeded(), now: NOW, findTakenHandles: async () => new Set() })
    const slots = planPersonaSlots(REQUEST, { random: seeded(), now: NOW })

    expect(result.missing).toBe(0)
    expect(result.drafts).toHaveLength(6)
    result.drafts.forEach((draft, index) => {
      expect(draft.personaCountry).toBe(slots[index].country.code)
      expect(draft.city).toBe(slots[index].city.name)
      expect(draft.latitude).toBe(slots[index].city.latitude)
      expect(draft.birthYear).toBe(slots[index].birthYear)
    })
    // A language outside the country's list falls back to the country default.
    expect(result.drafts[0].primaryLanguage).toBe(slots[0].country.languages[0])
    // Gender "any" lets the model choose.
    expect(result.drafts[0].gender).toBe('male')
  })

  it('asks once more for slots whose items failed validation, then reports what is still missing', async () => {
    const generate = fakeModel((persona, call) => {
      if (persona.slot === 1) return { slot: 1, name: 'Mingle Fan', handle: 'fan.one', bio: 'hi', primaryLanguage: 'ja', gender: 'female' }
      if (persona.slot === 2 && call === 1) return { slot: 2, name: 'Rin', handle: 'rin', bio: 'see https://x.com', primaryLanguage: 'ja', gender: 'female' }
      return null
    })
    const result = await generatePersonaDrafts(REQUEST, { generate, random: seeded(), now: NOW, findTakenHandles: async () => new Set() })

    // Round 1: two chunks (5 + 1). Round 2: one chunk with the two failed slots.
    expect(generate).toHaveBeenCalledTimes(3)
    const retryInput = generate.mock.calls[2][0].input as ModelInput
    expect(retryInput.personas.map(persona => persona.slot)).toEqual([1, 2])
    expect(result.drafts).toHaveLength(5)
    expect(result.missing).toBe(1)
  })

  it('makes handles unique within the batch and against taken or avoided handles', async () => {
    const generate = fakeModel(persona => ({ slot: persona.slot, name: `Lu ${persona.slot}`, handle: 'lucas.silva', bio: 'oi', primaryLanguage: persona.languages[0], gender: 'male' }))
    const result = await generatePersonaDrafts(
      { ...REQUEST, count: 3, avoidHandles: ['lucas.silva55'] },
      { generate, random: () => 0.5, now: NOW, findTakenHandles: async handles => new Set(handles.filter(handle => handle === 'lucas.silva')) },
    )
    const handles = result.drafts.map(draft => draft.handle)
    expect(new Set(handles).size).toBe(3)
    expect(handles).not.toContain('lucas.silva')
    expect(handles).not.toContain('lucas.silva55')
    expect(handles.every(handle => /^lucas\.silva\d+$/.test(handle))).toBe(true)
  })

  it('passes the tone note and avoid lists as data and uses the persona model override', async () => {
    const previous = process.env.MINGLE_PERSONA_LLM_MODEL
    process.env.MINGLE_PERSONA_LLM_MODEL = 'gemini-persona-test'
    try {
      const generate = fakeModel()
      await generatePersonaDrafts({ ...REQUEST, count: 1, notes: 'cheerful', avoidNames: ['Aoi'], avoidHandles: ['aoi'] }, { generate, random: seeded(), now: NOW, findTakenHandles: async () => new Set() })
      const call = generate.mock.calls[0][0]
      expect(call.model).toBe('gemini-persona-test')
      expect(call.temperature).toBe(1)
      expect(call.instructions).toContain('never the name of a real public figure')
      expect(call.input).toMatchObject({ toneNote: 'cheerful', avoidNames: ['Aoi'], avoidHandles: ['aoi'] })
      expect((call.input as ModelInput).personas[0]).toMatchObject({ slot: 0, gender: 'any' })
    } finally {
      if (previous === undefined) delete process.env.MINGLE_PERSONA_LLM_MODEL
      else process.env.MINGLE_PERSONA_LLM_MODEL = previous
    }
  })

  it('rethrows when the model is unavailable, without a second round', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const generate = vi.fn(async () => {
      throw new LlmError('llm_unavailable')
    })
    await expect(generatePersonaDrafts(REQUEST, { generate, random: seeded(), now: NOW, findTakenHandles: async () => new Set() }))
      .rejects.toMatchObject({ code: 'llm_unavailable' })
    expect(generate).toHaveBeenCalledTimes(2) // one per chunk, round 1 only
    expect(consoleWarn).toHaveBeenCalledWith('[operator-persona] draft_chunk_failed', { code: 'llm_unavailable' })
    consoleWarn.mockRestore()
  })
})
