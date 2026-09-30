import { describe, expect, it } from 'vitest'
import {
  PHOTO_TRANSLATION_OFF,
  buildPhotoTranslationOrder,
  createPhotoTranslationMemory,
  nextPhotoTranslationChoice,
  photoTranslationCycle,
  photoTranslationMemoryKey,
  resolvePhotoTranslationChoice,
  resolvePhotoTranslationLanguageState,
  resolvePhotoTranslationOptions,
  resolvePhotoTranslationToggle,
} from './photo-translation-toggle.logic'
import {
  photoTranslationBrandOnlyResponse,
  photoTranslationDisabledResponse,
  photoTranslationEmptyResponse,
  photoTranslationFailedResponse,
  photoTranslationKoreanOnlyResponse,
  photoTranslationPendingResponse,
  photoTranslationReadyResponse,
  photoTranslationSettledResponse,
} from './photo-translation.fixtures'

const ORDER = ['ko', 'en', 'ja']

describe('buildPhotoTranslationOrder', () => {
  it('puts the viewer default first, then the other room languages in room order', () => {
    expect(buildPhotoTranslationOrder(['en', 'ko', 'ja'], 'ko')).toEqual(['ko', 'en', 'ja'])
    expect(buildPhotoTranslationOrder(['en', 'ko', 'ja'], 'ja')).toEqual(['ja', 'en', 'ko'])
  })

  it('falls back to the first room language and drops unknown or duplicate codes', () => {
    expect(buildPhotoTranslationOrder(['en', 'ko'], null)).toEqual(['en', 'ko'])
    expect(buildPhotoTranslationOrder(['en', 'EN', 'xx', 'ko'], 'und')).toEqual(['en', 'ko'])
  })

  it('keeps zh-CN and zh-TW apart and caps the list at one request', () => {
    expect(buildPhotoTranslationOrder(['zh-CN', 'zh-TW', 'zh'], 'zh-TW')).toEqual(['zh-TW', 'zh-CN'])
    const many = ['af', 'sq', 'ar', 'az', 'eu', 'be', 'bn', 'bs', 'bg', 'ca']
    expect(buildPhotoTranslationOrder(many, 'ko')).toHaveLength(8)
    expect(buildPhotoTranslationOrder(many, 'ko')[0]).toBe('ko')
  })
})

describe('eligibility (spec §1.5)', () => {
  it('needs a block to translate and a pending or painting translation', () => {
    expect(resolvePhotoTranslationOptions(ORDER, photoTranslationReadyResponse)).toEqual([
      { language: 'ko', state: 'ready', eligible: true },
      { language: 'en', state: 'pending', eligible: true },
      { language: 'ja', state: 'unavailable', eligible: false },
    ])
  })

  it('treats a ready translation that paints nothing (brand names) as the same as the original', () => {
    expect(resolvePhotoTranslationLanguageState(photoTranslationBrandOnlyResponse, 'ko')).toBe('same')
    expect(resolvePhotoTranslationOptions(['ko'], photoTranslationBrandOnlyResponse)[0].eligible).toBe(false)
  })

  it('marks a language with nothing to translate as the same as the original', () => {
    expect(resolvePhotoTranslationLanguageState(photoTranslationKoreanOnlyResponse, 'ko')).toBe('same')
    expect(resolvePhotoTranslationLanguageState(photoTranslationKoreanOnlyResponse, 'en')).toBe('ready')
  })

  it('treats a failed or missing translation as unavailable', () => {
    expect(resolvePhotoTranslationLanguageState(photoTranslationReadyResponse, 'ja')).toBe('unavailable')
    expect(resolvePhotoTranslationLanguageState(photoTranslationReadyResponse, 'zh-TW')).toBe('unavailable')
  })

  it('makes nothing eligible before the photo text is known', () => {
    for (const response of [null, photoTranslationPendingResponse, photoTranslationFailedResponse, photoTranslationEmptyResponse, photoTranslationDisabledResponse]) {
      expect(resolvePhotoTranslationOptions(ORDER, response).some(option => option.eligible)).toBe(false)
    }
  })
})

describe('cycle, default and Off', () => {
  const options = resolvePhotoTranslationOptions(ORDER, photoTranslationReadyResponse)

  it('cycles through eligible languages in order, then Off, wrapping', () => {
    const cycle = photoTranslationCycle(options)
    expect(cycle).toEqual(['ko', 'en', PHOTO_TRANSLATION_OFF])
    expect(nextPhotoTranslationChoice(cycle, 'ko')).toBe('en')
    expect(nextPhotoTranslationChoice(cycle, 'en')).toBe(PHOTO_TRANSLATION_OFF)
    expect(nextPhotoTranslationChoice(cycle, PHOTO_TRANSLATION_OFF)).toBe('ko')
    expect(nextPhotoTranslationChoice(cycle, 'ja')).toBe('ko')
    expect(nextPhotoTranslationChoice([], 'ko')).toBe(PHOTO_TRANSLATION_OFF)
  })

  it('shows the viewer default when eligible, else Off', () => {
    expect(resolvePhotoTranslationChoice(options)).toBe('ko')
    expect(resolvePhotoTranslationChoice(resolvePhotoTranslationOptions(['ko', 'en'], photoTranslationKoreanOnlyResponse))).toBe(PHOTO_TRANSLATION_OFF)
    expect(resolvePhotoTranslationChoice(resolvePhotoTranslationOptions(['ja', 'ko'], photoTranslationReadyResponse))).toBe(PHOTO_TRANSLATION_OFF)
  })

  it('keeps an explicit choice while eligible and shows Off once it stops being eligible', () => {
    expect(resolvePhotoTranslationChoice(options, 'en')).toBe('en')
    expect(resolvePhotoTranslationChoice(options, PHOTO_TRANSLATION_OFF)).toBe(PHOTO_TRANSLATION_OFF)
    expect(resolvePhotoTranslationChoice(options, 'ja')).toBe(PHOTO_TRANSLATION_OFF)
    const brandOnly = resolvePhotoTranslationOptions(['en', 'ko'], photoTranslationBrandOnlyResponse)
    expect(resolvePhotoTranslationChoice(brandOnly, 'ko')).toBe(PHOTO_TRANSLATION_OFF)
  })

  it('ignores a remembered language that left the room', () => {
    expect(resolvePhotoTranslationChoice(options, 'fr')).toBe('ko')
  })
})

describe('resolvePhotoTranslationToggle', () => {
  it('shows the pill with a spinner while the shown language is pending', () => {
    const toggle = resolvePhotoTranslationToggle({ order: ORDER, response: photoTranslationReadyResponse, selection: 'en' })
    expect(toggle).toMatchObject({ choice: 'en', visible: true, pending: true, cycle: ['ko', 'en', PHOTO_TRANSLATION_OFF] })
    expect(resolvePhotoTranslationToggle({ order: ORDER, response: photoTranslationSettledResponse }).pending).toBe(false)
  })

  it('hides the pill when there is no text, the photo failed, the feature is off or nothing is eligible', () => {
    for (const response of [null, photoTranslationPendingResponse, photoTranslationEmptyResponse, photoTranslationFailedResponse, photoTranslationDisabledResponse, photoTranslationBrandOnlyResponse]) {
      expect(resolvePhotoTranslationToggle({ order: ['ko'], response }).visible).toBe(false)
    }
    expect(resolvePhotoTranslationToggle({ order: ['ko', 'en'], response: photoTranslationKoreanOnlyResponse })).toMatchObject({
      visible: true, choice: PHOTO_TRANSLATION_OFF, cycle: ['en', PHOTO_TRANSLATION_OFF],
    })
  })
})

describe('per-photo memory', () => {
  it('keys one photo per api namespace, viewer, conversation and message', () => {
    const base = { apiNamespace: 'ios/v2.1.0', viewerUserId: 'user-1', conversationId: 'conv-1', messageId: 'msg-1' }
    const key = photoTranslationMemoryKey(base)
    expect(key).toBe('ios%2Fv2.1.0:user-1:conv-1:msg-1')
    expect(photoTranslationMemoryKey({ ...base, apiNamespace: 'android/v2.1.0' })).not.toBe(key)
    expect(photoTranslationMemoryKey({ ...base, viewerUserId: 'user-2' })).not.toBe(key)
    expect(photoTranslationMemoryKey({ ...base, conversationId: 'conv-2' })).not.toBe(key)
    expect(photoTranslationMemoryKey({ ...base, messageId: 'msg-2' })).not.toBe(key)
    expect(photoTranslationMemoryKey({ ...base, apiNamespace: '', viewerUserId: null })).toBe('-:-:conv-1:msg-1')
  })

  it('remembers the latest choice and forgets the least recently written past the limit', () => {
    const memory = createPhotoTranslationMemory<string>(2)
    memory.set('a', 'en')
    memory.set('b', PHOTO_TRANSLATION_OFF)
    memory.set('a', 'ko')
    memory.set('c', 'ja')
    expect(memory.get('a')).toBe('ko')
    expect(memory.get('b')).toBeUndefined()
    expect(memory.get('c')).toBe('ja')
    expect(memory.size).toBe(2)
  })
})
