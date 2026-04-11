import { compareApiNamespaceVersions, parseApiNamespaceVersion } from './api-namespace-version'

export type MingleBehaviorProfile = 'legacy_1_0_11' | 'v1_1_0'
export type MingleClientReleaseVariant =
  | 'legacy_default_v1_0_11'
  | 'ios_v1_0_11'
  | 'android_v1_0_11'
  | 'ios_v1_1_0'
  | 'android_v1_1_0'

const FIRST_V1_1_0_VERSION: readonly [number, number, number] = [1, 1, 0]

export function resolveMingleClientReleaseVariant(apiNamespace: string): MingleClientReleaseVariant {
  const parsedNamespace = parseApiNamespaceVersion(apiNamespace)
  if (!parsedNamespace) {
    return 'legacy_default_v1_0_11'
  }

  const versionLine = compareApiNamespaceVersions(parsedNamespace.version, FIRST_V1_1_0_VERSION) >= 0
    ? 'v1_1_0'
    : 'v1_0_11'

  if (parsedNamespace.platform === 'ios') {
    return versionLine === 'v1_1_0' ? 'ios_v1_1_0' : 'ios_v1_0_11'
  }

  return versionLine === 'v1_1_0' ? 'android_v1_1_0' : 'android_v1_0_11'
}

export function resolveMingleBehaviorProfile(apiNamespace: string): MingleBehaviorProfile {
  const releaseVariant = resolveMingleClientReleaseVariant(apiNamespace)
  return releaseVariant === 'ios_v1_1_0' || releaseVariant === 'android_v1_1_0'
    ? 'v1_1_0'
    : 'legacy_1_0_11'
}

export function resolveDefaultMingleBehaviorProfile(): MingleBehaviorProfile {
  return resolveMingleBehaviorProfile(process.env.NEXT_PUBLIC_API_NAMESPACE || '')
}

export function resolveDefaultMingleClientReleaseVariant(): MingleClientReleaseVariant {
  return resolveMingleClientReleaseVariant(process.env.NEXT_PUBLIC_API_NAMESPACE || '')
}

export function isLegacyMingleClientReleaseVariant(
  releaseVariant: MingleClientReleaseVariant,
): boolean {
  return releaseVariant === 'legacy_default_v1_0_11'
    || releaseVariant === 'ios_v1_0_11'
    || releaseVariant === 'android_v1_0_11'
}

export function isV1_1_0MingleClientReleaseVariant(
  releaseVariant: MingleClientReleaseVariant,
): boolean {
  return releaseVariant === 'ios_v1_1_0' || releaseVariant === 'android_v1_1_0'
}

export function supportsConversationRoomsForReleaseVariant(
  releaseVariant: MingleClientReleaseVariant,
): boolean {
  return isV1_1_0MingleClientReleaseVariant(releaseVariant)
}

export function resolvePostAuthPathForReleaseVariant(
  releaseVariant: MingleClientReleaseVariant,
): '/translator' | '/conversations' {
  return supportsConversationRoomsForReleaseVariant(releaseVariant)
    ? '/conversations'
    : '/translator'
}

export function usesVersionedAccountPreferencesApiForReleaseVariant(
  releaseVariant: MingleClientReleaseVariant,
): boolean {
  return supportsConversationRoomsForReleaseVariant(releaseVariant)
}

export function readRequestedApiNamespaceFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const rawValue = searchParams.apiNamespace ?? searchParams.apiNs
  if (typeof rawValue === 'string') return rawValue.trim()
  if (Array.isArray(rawValue)) return (rawValue[0] || '').trim()
  return ''
}
