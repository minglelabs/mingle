import { describe, expect, it } from 'vitest'

import {
  EXPECTED_API_NAMESPACE_BY_OS,
  normalizeApiNamespace,
  resolveExpectedApiNamespace,
  validateRnApiNamespace,
} from '../../rn/src/apiNamespace'

describe('RN api namespace validation contract', () => {
  it('normalizes leading and trailing slashes', () => {
    expect(normalizeApiNamespace(` /${EXPECTED_API_NAMESPACE_BY_OS.ios}/ `)).toBe(
      EXPECTED_API_NAMESPACE_BY_OS.ios,
    )
  })

  it('returns expected namespace by runtime os', () => {
    expect(resolveExpectedApiNamespace('ios')).toBe(EXPECTED_API_NAMESPACE_BY_OS.ios)
    expect(resolveExpectedApiNamespace('android')).toBe(EXPECTED_API_NAMESPACE_BY_OS.android)
    expect(resolveExpectedApiNamespace('web')).toBe('')
  })

  it('accepts only matching iOS namespace', () => {
    const result = validateRnApiNamespace({
      runtimeOs: 'ios',
      configuredApiNamespace: EXPECTED_API_NAMESPACE_BY_OS.ios,
    })

    expect(result.expectedApiNamespace).toBe(EXPECTED_API_NAMESPACE_BY_OS.ios)
    expect(result.validatedApiNamespace).toBe(EXPECTED_API_NAMESPACE_BY_OS.ios)
  })

  it('accepts only matching Android namespace', () => {
    const result = validateRnApiNamespace({
      runtimeOs: 'android',
      configuredApiNamespace: EXPECTED_API_NAMESPACE_BY_OS.android,
    })

    expect(result.expectedApiNamespace).toBe(EXPECTED_API_NAMESPACE_BY_OS.android)
    expect(result.validatedApiNamespace).toBe(EXPECTED_API_NAMESPACE_BY_OS.android)
  })

  it('rejects mismatched namespace for Android runtime', () => {
    const result = validateRnApiNamespace({
      runtimeOs: 'android',
      configuredApiNamespace: EXPECTED_API_NAMESPACE_BY_OS.ios,
    })

    expect(result.expectedApiNamespace).toBe(EXPECTED_API_NAMESPACE_BY_OS.android)
    expect(result.validatedApiNamespace).toBe('')
  })

  it('rejects empty namespace', () => {
    const result = validateRnApiNamespace({
      runtimeOs: 'ios',
      configuredApiNamespace: '  ',
    })

    expect(result.validatedApiNamespace).toBe('')
  })
})
