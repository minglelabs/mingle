export type MingleSttBehaviorProfile = 'legacy_1_0_11' | 'v1_1_0' | 'v1_1_1' | 'v1_1_2' | 'v1_1_3' | 'v2_0_0'
export type MingleSttReleaseVariant =
    | 'legacy_default_v1_0_11'
    | 'default_v1_1_0'
    | 'default_v1_1_1'
    | 'default_v1_1_2'
    | 'default_v1_1_3'
    | 'default_v2_0_0'
    | 'ios_v1_0_11'
    | 'android_v1_0_11'
    | 'ios_v1_1_0'
    | 'android_v1_1_0'
    | 'ios_v1_1_1'
    | 'android_v1_1_1'
    | 'ios_v1_1_2'
    | 'android_v1_1_2'
    | 'ios_v1_1_3'
    | 'android_v1_1_3'
    | 'ios_v2_0_0'
    | 'android_v2_0_0'

type ApiNamespaceVersion = {
  platform: 'android' | 'ios'
  version: readonly [number, number, number]
}

const FIRST_V1_1_0_VERSION: readonly [number, number, number] = [1, 1, 0]
const FIRST_V1_1_1_VERSION: readonly [number, number, number] = [1, 1, 1]
const FIRST_V1_1_2_VERSION: readonly [number, number, number] = [1, 1, 2]
const FIRST_V1_1_3_VERSION: readonly [number, number, number] = [1, 1, 3]
const FIRST_V2_0_0_VERSION: readonly [number, number, number] = [2, 0, 0]

function normalizeApiNamespace(raw: string): string {
  return raw.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function parseApiNamespaceVersion(rawNamespace: string): ApiNamespaceVersion | null {
  const normalizedNamespace = normalizeApiNamespace(rawNamespace)
  if (!normalizedNamespace) return null

  const match = /^(ios|android)\/v(\d+)\.(\d+)\.(\d+)$/.exec(normalizedNamespace)
  if (!match) return null

  const major = Number(match[2])
  const minor = Number(match[3])
  const patch = Number(match[4])
  if (![major, minor, patch].every(Number.isFinite)) return null

  return {
    platform: match[1] as ApiNamespaceVersion['platform'],
    version: [major, minor, patch] as const,
  }
}

function compareApiNamespaceVersions(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue
    return left[index] > right[index] ? 1 : -1
  }

  return 0
}

export function resolveMingleSttReleaseVariant(apiNamespace: string): MingleSttReleaseVariant {
    const parsedNamespace = parseApiNamespaceVersion(apiNamespace)
    if (!parsedNamespace) {
        return 'legacy_default_v1_0_11'
    }

    const versionLine = compareApiNamespaceVersions(parsedNamespace.version, FIRST_V2_0_0_VERSION) >= 0
        ? 'v2_0_0'
        : compareApiNamespaceVersions(parsedNamespace.version, FIRST_V1_1_3_VERSION) >= 0
            ? 'v1_1_3'
            : compareApiNamespaceVersions(parsedNamespace.version, FIRST_V1_1_2_VERSION) >= 0
                ? 'v1_1_2'
                : compareApiNamespaceVersions(parsedNamespace.version, FIRST_V1_1_1_VERSION) >= 0
                    ? 'v1_1_1'
                    : compareApiNamespaceVersions(parsedNamespace.version, FIRST_V1_1_0_VERSION) >= 0
                        ? 'v1_1_0'
                        : 'v1_0_11'

    if (parsedNamespace.platform === 'ios') {
        if (versionLine === 'v2_0_0') return 'ios_v2_0_0'
        if (versionLine === 'v1_1_3') return 'ios_v1_1_3'
        if (versionLine === 'v1_1_2') return 'ios_v1_1_2'
        if (versionLine === 'v1_1_1') return 'ios_v1_1_1'
        return versionLine === 'v1_1_0' ? 'ios_v1_1_0' : 'ios_v1_0_11'
    }

    if (versionLine === 'v2_0_0') return 'android_v2_0_0'
    if (versionLine === 'v1_1_3') return 'android_v1_1_3'
    if (versionLine === 'v1_1_2') return 'android_v1_1_2'
    if (versionLine === 'v1_1_1') return 'android_v1_1_1'
    return versionLine === 'v1_1_0' ? 'android_v1_1_0' : 'android_v1_0_11'
}

export function parseMingleSttReleaseVariant(rawReleaseVariant: string): MingleSttReleaseVariant | null {
    const normalizedReleaseVariant = rawReleaseVariant.trim()
    switch (normalizedReleaseVariant) {
        case 'legacy_default_v1_0_11':
        case 'default_v1_1_0':
        case 'default_v1_1_1':
        case 'default_v1_1_2':
        case 'default_v1_1_3':
        case 'default_v2_0_0':
        case 'ios_v1_0_11':
        case 'android_v1_0_11':
        case 'ios_v1_1_0':
        case 'android_v1_1_0':
        case 'ios_v1_1_1':
        case 'android_v1_1_1':
        case 'ios_v1_1_2':
        case 'android_v1_1_2':
        case 'ios_v1_1_3':
        case 'android_v1_1_3':
        case 'ios_v2_0_0':
        case 'android_v2_0_0':
            return normalizedReleaseVariant
        default:
            return null
    }
}

export function resolveMingleSttBehaviorProfileForReleaseVariant(
    releaseVariant: MingleSttReleaseVariant,
): MingleSttBehaviorProfile {
    if (
        releaseVariant === 'default_v2_0_0'
        || releaseVariant === 'ios_v2_0_0'
        || releaseVariant === 'android_v2_0_0'
    ) {
        return 'v2_0_0'
    }

    if (
        releaseVariant === 'default_v1_1_3'
        || releaseVariant === 'ios_v1_1_3'
        || releaseVariant === 'android_v1_1_3'
    ) {
        return 'v1_1_3'
    }

    if (
        releaseVariant === 'default_v1_1_2'
        || releaseVariant === 'ios_v1_1_2'
        || releaseVariant === 'android_v1_1_2'
    ) {
        return 'v1_1_2'
    }

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

export function resolveMingleSttBehaviorProfile(apiNamespace: string): MingleSttBehaviorProfile {
    const releaseVariant = resolveMingleSttReleaseVariant(apiNamespace)
    return resolveMingleSttBehaviorProfileForReleaseVariant(releaseVariant)
}

export function isLegacyMingleSttReleaseVariant(
    releaseVariant: MingleSttReleaseVariant,
): boolean {
    return releaseVariant === 'legacy_default_v1_0_11'
        || releaseVariant === 'ios_v1_0_11'
        || releaseVariant === 'android_v1_0_11'
}
