import { afterEach, describe, expect, it } from 'vitest'

import {
  isLegacyMingleClientReleaseVariant,
  isV1_1_0MingleClientReleaseVariant,
  isV1_1_1MingleClientReleaseVariant,
  readRequestedApiNamespaceFromSearchParams,
  resolveDefaultMingleClientReleaseVariant,
  resolveDefaultMingleBehaviorProfile,
  resolveMingleBehaviorProfileForReleaseVariant,
  resolveMingleClientReleaseVariant,
  resolveMingleBehaviorProfile,
  resolveMingleReleaseTarget,
} from './client-behavior-profile'

describe('resolveMingleBehaviorProfile', () => {
  it('keeps 1.0.11 and lower on the legacy profile', () => {
    expect(resolveMingleBehaviorProfile('ios/v1.0.11')).toBe('legacy_1_0_11')
    expect(resolveMingleBehaviorProfile('android/v1.0.7')).toBe('legacy_1_0_11')
    expect(resolveMingleBehaviorProfile('')).toBe('legacy_1_0_11')
  })

  it('routes 1.1.0 and above to the new profile', () => {
    expect(resolveMingleBehaviorProfile('ios/v1.1.0')).toBe('v1_1_0')
    expect(resolveMingleBehaviorProfile('ios/v1.1.1')).toBe('v1_1_1')
    expect(resolveMingleBehaviorProfile('android/v1.1.1')).toBe('v1_1_1')
    expect(resolveMingleBehaviorProfile('android/v1.2.3')).toBe('v1_1_1')
  })
})

describe('resolveMingleClientReleaseVariant', () => {
  it('keeps explicit ios and android 1.0.11 targets separate', () => {
    expect(resolveMingleClientReleaseVariant('ios/v1.0.11')).toBe('ios_v1_0_11')
    expect(resolveMingleClientReleaseVariant('android/v1.0.7')).toBe('android_v1_0_11')
  })

  it('keeps explicit ios and android 1.1.0 targets separate', () => {
    expect(resolveMingleClientReleaseVariant('ios/v1.1.0')).toBe('ios_v1_1_0')
    expect(resolveMingleClientReleaseVariant('android/v1.1.0')).toBe('android_v1_1_0')
  })

  it('keeps explicit ios and android 1.1.1 targets separate', () => {
    expect(resolveMingleClientReleaseVariant('ios/v1.1.1')).toBe('ios_v1_1_1')
    expect(resolveMingleClientReleaseVariant('android/v1.1.1')).toBe('android_v1_1_1')
  })

  it('defaults unknown namespaces to the safe legacy release line', () => {
    expect(resolveMingleClientReleaseVariant('')).toBe('legacy_default_v1_0_11')
  })
})

describe('resolveMingleReleaseTarget', () => {
  it('recognizes the dedicated 1.1.0 web release target', () => {
    expect(resolveMingleReleaseTarget('v1_1_0')).toBe('v1_1_0')
    expect(resolveMingleReleaseTarget('v1_1_1')).toBe('v1_1_1')
    expect(resolveMingleReleaseTarget('')).toBe('unknown')
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
  const originalNamespace = process.env.NEXT_PUBLIC_API_NAMESPACE
  const originalReleaseTarget = process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = originalNamespace
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = originalReleaseTarget
  })

  it('defaults to the safe legacy profile when no namespace is configured', () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = ''

    expect(resolveDefaultMingleBehaviorProfile()).toBe('legacy_1_0_11')
    expect(resolveDefaultMingleClientReleaseVariant()).toBe('legacy_default_v1_0_11')
    expect(isLegacyMingleClientReleaseVariant(resolveDefaultMingleClientReleaseVariant())).toBe(true)
  })

  it('uses the dedicated 1.1.0 release target when the namespace is intentionally blank', () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = 'v1_1_0'

    expect(resolveDefaultMingleBehaviorProfile()).toBe('v1_1_0')
    expect(resolveDefaultMingleClientReleaseVariant()).toBe('default_v1_1_0')
  })

  it('uses the dedicated 1.1.1 release target when the namespace is intentionally blank', () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''
    process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = 'v1_1_1'

    expect(resolveDefaultMingleBehaviorProfile()).toBe('v1_1_1')
    expect(resolveDefaultMingleClientReleaseVariant()).toBe('default_v1_1_1')
  })
})

describe('release-variant feature flags', () => {
  it('keeps legacy variants on the legacy release line', () => {
    expect(isLegacyMingleClientReleaseVariant('legacy_default_v1_0_11')).toBe(true)
    expect(isLegacyMingleClientReleaseVariant('ios_v1_0_11')).toBe(true)
    expect(isLegacyMingleClientReleaseVariant('android_v1_0_11')).toBe(true)
  })

  it('keeps 1.1.0 variants on the new release line', () => {
    expect(isV1_1_0MingleClientReleaseVariant('default_v1_1_0')).toBe(true)
    expect(isV1_1_0MingleClientReleaseVariant('ios_v1_1_0')).toBe(true)
    expect(isV1_1_0MingleClientReleaseVariant('android_v1_1_0')).toBe(true)
    expect(resolveMingleBehaviorProfileForReleaseVariant('default_v1_1_0')).toBe('v1_1_0')
  })

  it('keeps 1.1.1 variants on the 1.1.1 release line', () => {
    expect(isV1_1_1MingleClientReleaseVariant('default_v1_1_1')).toBe(true)
    expect(isV1_1_1MingleClientReleaseVariant('ios_v1_1_1')).toBe(true)
    expect(isV1_1_1MingleClientReleaseVariant('android_v1_1_1')).toBe(true)
    expect(resolveMingleBehaviorProfileForReleaseVariant('default_v1_1_1')).toBe('v1_1_1')
  })
})
