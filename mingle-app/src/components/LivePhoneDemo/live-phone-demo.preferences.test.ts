import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SONIOX_SILENCE_MS,
  DEFAULT_TEXT_SIZE_LEVEL,
  MAX_SONIOX_SILENCE_MS,
  MIN_SONIOX_SILENCE_MS,
  readPersistedIntegerPreference,
} from './live-phone-demo.preferences'

describe('readPersistedIntegerPreference', () => {
  it('falls back when the stored value is missing or blank', () => {
    expect(readPersistedIntegerPreference(null, DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(DEFAULT_TEXT_SIZE_LEVEL)
    expect(readPersistedIntegerPreference('', DEFAULT_SONIOX_SILENCE_MS, MIN_SONIOX_SILENCE_MS, MAX_SONIOX_SILENCE_MS)).toBe(DEFAULT_SONIOX_SILENCE_MS)
    expect(readPersistedIntegerPreference('   ', DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(DEFAULT_TEXT_SIZE_LEVEL)
  })

  it('uses the persisted value when it is valid', () => {
    expect(readPersistedIntegerPreference('5', DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(5)
    expect(readPersistedIntegerPreference('3000', DEFAULT_SONIOX_SILENCE_MS, MIN_SONIOX_SILENCE_MS, MAX_SONIOX_SILENCE_MS)).toBe(3000)
  })

  it('falls back for invalid or non-positive values', () => {
    expect(readPersistedIntegerPreference('0', DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(DEFAULT_TEXT_SIZE_LEVEL)
    expect(readPersistedIntegerPreference('-10', DEFAULT_SONIOX_SILENCE_MS, MIN_SONIOX_SILENCE_MS, MAX_SONIOX_SILENCE_MS)).toBe(DEFAULT_SONIOX_SILENCE_MS)
    expect(readPersistedIntegerPreference('not-a-number', DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(DEFAULT_TEXT_SIZE_LEVEL)
  })

  it('clamps out-of-range persisted values', () => {
    expect(readPersistedIntegerPreference('99', DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(5)
    expect(readPersistedIntegerPreference('1', DEFAULT_SONIOX_SILENCE_MS, MIN_SONIOX_SILENCE_MS, MAX_SONIOX_SILENCE_MS)).toBe(MIN_SONIOX_SILENCE_MS)
    expect(readPersistedIntegerPreference('99999', DEFAULT_SONIOX_SILENCE_MS, MIN_SONIOX_SILENCE_MS, MAX_SONIOX_SILENCE_MS)).toBe(MAX_SONIOX_SILENCE_MS)
  })
})
