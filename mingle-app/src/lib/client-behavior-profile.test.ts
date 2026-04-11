import { afterEach, describe, expect, it } from 'vitest'

import {
  isLegacyMingleClientReleaseVariant,
  readRequestedApiNamespaceFromSearchParams,
  resolveDefaultMingleClientReleaseVariant,
  resolveDefaultMingleBehaviorProfile,
  resolveMingleClientReleaseVariant,
  resolveMingleBehaviorProfile,
  resolvePostAuthPathForReleaseVariant,
  supportsConversationRoomsForReleaseVariant,
  usesVersionedAccountPreferencesApiForReleaseVariant,
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

describe('resolveMingleClientReleaseVariant', () => {
  it('keeps explicit ios and android 1.0.11 targets separate', () => {
    expect(resolveMingleClientReleaseVariant('ios/v1.0.11')).toBe('ios_v1_0_11')
    expect(resolveMingleClientReleaseVariant('android/v1.0.7')).toBe('android_v1_0_11')
  })

  it('keeps explicit ios and android 1.1.0 targets separate', () => {
    expect(resolveMingleClientReleaseVariant('ios/v1.1.0')).toBe('ios_v1_1_0')
    expect(resolveMingleClientReleaseVariant('android/v1.1.0')).toBe('android_v1_1_0')
  })

  it('defaults unknown namespaces to the safe legacy release line', () => {
    expect(resolveMingleClientReleaseVariant('')).toBe('legacy_default_v1_0_11')
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

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = originalNamespace
  })

  it('defaults to the safe legacy profile when no namespace is configured', () => {
    process.env.NEXT_PUBLIC_API_NAMESPACE = ''

    expect(resolveDefaultMingleBehaviorProfile()).toBe('legacy_1_0_11')
    expect(resolveDefaultMingleClientReleaseVariant()).toBe('legacy_default_v1_0_11')
    expect(isLegacyMingleClientReleaseVariant(resolveDefaultMingleClientReleaseVariant())).toBe(true)
  })
})

describe('release-variant feature flags', () => {
  it('keeps legacy variants on the translator shell without conversation rooms', () => {
    expect(supportsConversationRoomsForReleaseVariant('legacy_default_v1_0_11')).toBe(false)
    expect(supportsConversationRoomsForReleaseVariant('ios_v1_0_11')).toBe(false)
    expect(supportsConversationRoomsForReleaseVariant('android_v1_0_11')).toBe(false)
    expect(resolvePostAuthPathForReleaseVariant('ios_v1_0_11')).toBe('/translator')
    expect(usesVersionedAccountPreferencesApiForReleaseVariant('android_v1_0_11')).toBe(false)
  })

  it('keeps 1.1.0 variants on the conversations shell with versioned preferences', () => {
    expect(supportsConversationRoomsForReleaseVariant('ios_v1_1_0')).toBe(true)
    expect(supportsConversationRoomsForReleaseVariant('android_v1_1_0')).toBe(true)
    expect(resolvePostAuthPathForReleaseVariant('android_v1_1_0')).toBe('/conversations')
    expect(usesVersionedAccountPreferencesApiForReleaseVariant('ios_v1_1_0')).toBe(true)
  })
})
