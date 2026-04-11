import { afterEach, describe, expect, it } from 'vitest'

import {
  readRequestedApiNamespaceFromSearchParams,
  resolveDefaultMingleBehaviorProfile,
  resolveMingleBehaviorProfile,
} from './client-behavior-profile'

describe('resolveMingleBehaviorProfile', () => {
  it('keeps 1.0.11 and lower on the legacy profile', () => {
    expect(resolveMingleBehaviorProfile('ios/v1.0.11')).toBe('legacy_1_0_11')
    expect(resolveMingleBehaviorProfile('android/v1.0.7')).toBe('legacy_1_0_11')
    expect(resolveMingleBehaviorProfile('')).toBe('legacy_1_0_11')
  })

  it('routes 1.1.0 and above to the new profile', () => {
    expect(resolveMingleBehaviorProfile('ios/v1.1.0')).toBe('v1_1_0')
    expect(resolveMingleBehaviorProfile('android/v1.2.3')).toBe('v1_1_0')
  })
})

describe('readRequestedApiNamespaceFromSearchParams', () => {
  it('prefers apiNamespace and falls back to apiNs', () => {
    expect(
      readRequestedApiNamespaceFromSearchParams({
        apiNamespace: 'ios/v1.1.0',
        apiNs: 'android/v1.0.11',
      }),
    ).toBe('ios/v1.1.0')

    expect(
      readRequestedApiNamespaceFromSearchParams({
        apiNs: ['android/v1.0.11'],
      }),
    ).toBe('android/v1.0.11')
  })
})

describe('resolveDefaultMingleBehaviorProfile', () => {
  const originalReleaseTarget = process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET
  const originalNamespace = process.env.NEXT_PUBLIC_API_NAMESPACE

  afterEach(() => {
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = originalReleaseTarget
    process.env.NEXT_PUBLIC_API_NAMESPACE = originalNamespace
  })

  it('prefers the dedicated release target env when present', () => {
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = 'v1_1_0'
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''

    expect(resolveDefaultMingleBehaviorProfile()).toBe('v1_1_0')
  })
})
