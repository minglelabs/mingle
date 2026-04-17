import { compareApiNamespaceVersions, parseApiNamespaceVersion } from './api-namespace-version'

export type MingleBehaviorProfile = 'legacy_1_0_11' | 'v1_1_0' | 'v1_1_1'
export type MingleClientReleaseVariant =
  | 'legacy_default_v1_0_11'
  | 'default_v1_1_0'
  | 'default_v1_1_1'
  | 'ios_v1_0_11'
  | 'android_v1_0_11'
  | 'ios_v1_1_0'
  | 'android_v1_1_0'
  | 'ios_v1_1_1'
  | 'android_v1_1_1'
export type MingleReleaseTarget = 'legacy_1_0_11' | 'v1_1_0' | 'v1_1_1' | 'unknown'

const FIRST_V1_1_0_VERSION: readonly [number, number, number] = [1, 1, 0]
const FIRST_V1_1_1_VERSION: readonly [number, number, number] = [1, 1, 1]

function normalizeReleaseTarget(rawValue: string): string {
  return rawValue.trim().toLowerCase()
}

export function resolveMingleReleaseTarget(rawReleaseTarget: string): MingleReleaseTarget {
  const normalizedReleaseTarget = normalizeReleaseTarget(rawReleaseTarget)
  if (normalizedReleaseTarget === 'v1_1_2') {
    return 'v1_1_1'
  }
  if (normalizedReleaseTarget === 'v1_1_0') {
    return 'v1_1_0'
  }
  if (normalizedReleaseTarget === 'v1_1_1') {
    return 'v1_1_1'
  }
  if (normalizedReleaseTarget === 'legacy_1_0_11') {
    return 'legacy_1_0_11'
  }
  return 'unknown'
}

export function resolveMingleClientReleaseVariant(apiNamespace: string): MingleClientReleaseVariant {
  const parsedNamespace = parseApiNamespaceVersion(apiNamespace)
  if (!parsedNamespace) {
    return 'legacy_default_v1_0_11'
  }

  const versionLine = compareApiNamespaceVersions(parsedNamespace.version, FIRST_V1_1_1_VERSION) >= 0
    ? 'v1_1_1'
    : compareApiNamespaceVersions(parsedNamespace.version, FIRST_V1_1_0_VERSION) >= 0
      ? 'v1_1_0'
      : 'v1_0_11'

  if (parsedNamespace.platform === 'ios') {
    if (versionLine === 'v1_1_1') return 'ios_v1_1_1'
    return versionLine === 'v1_1_0' ? 'ios_v1_1_0' : 'ios_v1_0_11'
  }

  if (versionLine === 'v1_1_1') return 'android_v1_1_1'
  return versionLine === 'v1_1_0' ? 'android_v1_1_0' : 'android_v1_0_11'
}

export function resolveMingleBehaviorProfileForReleaseVariant(
  releaseVariant: MingleClientReleaseVariant,
): MingleBehaviorProfile {
  if (
    releaseVariant === 'default_v1_1_1'
    || releaseVariant === 'ios_v1_1_1'
    || releaseVariant === 'android_v1_1_1'
  ) {
    return 'v1_1_1'
  }

  return releaseVariant === 'default_v1_1_0'
    || releaseVariant === 'ios_v1_1_0'
    || releaseVariant === 'android_v1_1_0'
    ? 'v1_1_0'
    : 'legacy_1_0_11'
}

export function resolveMingleBehaviorProfile(apiNamespace: string): MingleBehaviorProfile {
  return resolveMingleBehaviorProfileForReleaseVariant(resolveMingleClientReleaseVariant(apiNamespace))
}

export function resolveDefaultMingleClientReleaseVariant(): MingleClientReleaseVariant {
  const envNamespace = (process.env.NEXT_PUBLIC_API_NAMESPACE || '').trim()
  if (envNamespace) {
    return resolveMingleClientReleaseVariant(envNamespace)
  }

  const releaseTarget = resolveMingleReleaseTarget(process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET || '')
  if (releaseTarget === 'v1_1_0') {
    return 'default_v1_1_0'
  }
  if (releaseTarget === 'v1_1_1') {
    return 'default_v1_1_1'
  }

  return 'legacy_default_v1_0_11'
}

export function resolveDefaultMingleBehaviorProfile(): MingleBehaviorProfile {
  return resolveMingleBehaviorProfileForReleaseVariant(resolveDefaultMingleClientReleaseVariant())
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
  return releaseVariant === 'default_v1_1_0'
    || releaseVariant === 'ios_v1_1_0'
    || releaseVariant === 'android_v1_1_0'
}

export function isV1_1_1MingleClientReleaseVariant(
  releaseVariant: MingleClientReleaseVariant,
): boolean {
  return releaseVariant === 'default_v1_1_1'
    || releaseVariant === 'ios_v1_1_1'
    || releaseVariant === 'android_v1_1_1'
}

export function readRequestedApiNamespaceFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const rawValue = searchParams.apiNamespace ?? searchParams.apiNs
  if (typeof rawValue === 'string') return rawValue.trim()
  if (Array.isArray(rawValue)) return (rawValue[0] || '').trim()
  return ''
}
