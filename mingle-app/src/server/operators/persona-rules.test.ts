import { describe, expect, it } from 'vitest'
import { parseOperatorPatch, validatePersonaDraft, type PersonaDraftField } from './persona-rules'

const NOW = new Date('2026-09-30T00:00:00Z')

const VALID = {
  name: '田中 ゆき',
  handle: '@Yuki.Tnk',
  personaCountry: 'jp',
  city: 'osaka',
  birthYear: 1998,
  bio: '大阪でカフェ巡りと写真が好き📷 韓国語を勉強中',
  primaryLanguage: 'ja',
  gender: 'female',
  // Client-sent location details are never trusted.
  countryName: 'Atlantis',
  latitude: 1.23456,
  longitude: 2.34567,
}

function errorsOf(patch: Record<string, unknown>): { field: PersonaDraftField; error: string }[] {
  const result = validatePersonaDraft({ ...VALID, ...patch }, { now: NOW })
  return result.ok ? [] : result.errors
}

describe('validatePersonaDraft', () => {
  it('accepts a good draft and normalizes it (lower-case handle, table location)', () => {
    const result = validatePersonaDraft(VALID, { now: NOW })
    expect(result).toEqual({
      ok: true,
      draft: {
        name: '田中 ゆき',
        handle: 'yuki.tnk',
        personaCountry: 'JP',
        city: 'Osaka',
        countryName: 'Japan',
        latitude: 34.69,
        longitude: 135.5,
        birthYear: 1998,
        bio: VALID.bio,
        primaryLanguage: 'ja',
        gender: 'female',
      },
    })
  })

  it.each([
    [{ name: '   ' }, 'name', 'name_required'],
    [{ name: 'a'.repeat(41) }, 'name', 'name_too_long'],
    [{ name: 'Mingle Team' }, 'name', 'reserved_name'],
    [{ name: '운영자 민준' }, 'name', 'reserved_name'],
    [{ name: 'yuki@insta' }, 'name', 'invalid_name'],
    [{ name: '12345' }, 'name', 'invalid_name'],
    [{ name: 'Yuki\nTanaka' }, 'name', 'invalid_name'],
    [{ handle: 'yu' }, 'handle', 'handle_too_short'],
    [{ handle: 'yuki tnk' }, 'handle', 'invalid_handle'],
    [{ handle: 'ゆき' }, 'handle', 'invalid_handle'],
    [{ handle: 'yuki.' }, 'handle', 'invalid_handle'],
    [{ handle: 'yu..ki' }, 'handle', 'invalid_handle'],
    [{ handle: 'a'.repeat(31) }, 'handle', 'invalid_handle'],
    [{ handle: 'anon_yuki' }, 'handle', 'reserved_handle'],
    [{ handle: 'admin' }, 'handle', 'reserved_handle'],
    [{ handle: 'mingle_yuki' }, 'handle', 'reserved_handle'],
    [{ handle: 'support.kim' }, 'handle', 'reserved_handle'],
    [{ birthYear: 2007 }, 'birthYear', 'too_young'],
    [{ birthYear: 1940 }, 'birthYear', 'invalid_birth_year'],
    [{ birthYear: 1998.5 }, 'birthYear', 'invalid_birth_year'],
    [{ personaCountry: 'ZZ' }, 'personaCountry', 'invalid_country'],
    [{ city: 'Seoul' }, 'city', 'invalid_city'],
    [{ bio: 'x'.repeat(161) }, 'bio', 'bio_too_long'],
    [{ bio: 'DM me https://example.com' }, 'bio', 'bio_contact_details'],
    [{ bio: 'mail me yuki@example.com' }, 'bio', 'bio_contact_details'],
    [{ bio: 'call 010-1234-5678' }, 'bio', 'bio_contact_details'],
    [{ bio: 'insta @yuki_tnk' }, 'bio', 'bio_contact_details'],
    [{ bio: 'Mingleで友達募集中' }, 'bio', 'bio_mentions_mingle'],
    [{ primaryLanguage: 'xx' }, 'primaryLanguage', 'invalid_language'],
    [{ gender: 'robot' }, 'gender', 'invalid_gender'],
  ])('rejects %o', (patch, field, error) => {
    expect(errorsOf(patch)).toContainEqual({ field, error })
  })

  it('allows ordinary words that only contain reserved fragments', () => {
    expect(errorsOf({ name: 'Badminton Lee', handle: 'badminton_lee', bio: 'Seoul 2019 - 2024 🏸 #badminton' })).toEqual([])
  })

  it('treats an empty bio as no bio and a missing gender as undecided', () => {
    const result = validatePersonaDraft({ ...VALID, bio: '   ', gender: undefined }, { now: NOW })
    expect(result.ok && result.draft.bio).toBe('')
    expect(result.ok && result.draft.gender).toBeNull()
  })

  it('reports every invalid field at once', () => {
    const fields = errorsOf({ name: '', handle: 'x', birthYear: 2010 }).map(error => error.field)
    expect(fields).toEqual(['name', 'handle', 'birthYear'])
    expect(validatePersonaDraft('nope')).toEqual({ ok: false, errors: [{ field: 'draft', error: 'invalid_draft' }] })
  })
})

describe('parseOperatorPatch', () => {
  it('keeps only the fields that are present', () => {
    expect(parseOperatorPatch({ name: ' Mina ', bio: null, notes: '  ' }, { now: NOW })).toEqual({
      ok: true,
      patch: { name: 'Mina', bio: null, notes: null },
    })
  })

  it('moves country and city together and validates the pair', () => {
    const result = parseOperatorPatch({ personaCountry: 'KR', city: 'busan' }, { now: NOW })
    expect(result.ok && result.patch.location?.city.name).toBe('Busan')
    expect(parseOperatorPatch({ city: 'Busan' }, { now: NOW })).toEqual({ ok: false, errors: [{ field: 'personaCountry', error: 'invalid_country' }] })
    expect(parseOperatorPatch({ personaCountry: 'KR', city: 'Osaka' }, { now: NOW })).toEqual({ ok: false, errors: [{ field: 'city', error: 'invalid_city' }] })
  })

  it('rejects an empty or invalid patch', () => {
    expect(parseOperatorPatch({}, { now: NOW })).toEqual({ ok: false, errors: [{ field: 'draft', error: 'no_fields_to_update' }] })
    expect(parseOperatorPatch({ handle: 'Admin', birthYear: 2015 }, { now: NOW })).toEqual({
      ok: false,
      errors: [{ field: 'handle', error: 'reserved_handle' }, { field: 'birthYear', error: 'too_young' }],
    })
    expect(parseOperatorPatch({ notes: 'n'.repeat(1001) }, { now: NOW })).toEqual({ ok: false, errors: [{ field: 'notes', error: 'notes_too_long' }] })
  })
})
