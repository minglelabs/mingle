import { compareApiNamespaceVersions, parseApiNamespaceVersion } from './api-namespace-version'

export type MingleBehaviorProfile = 'legacy_1_0_11' | 'v1_1_0'

const FIRST_V1_1_0_VERSION: readonly [number, number, number] = [1, 1, 0]

export function resolveMingleBehaviorProfile(apiNamespace: string): MingleBehaviorProfile {
  const parsedNamespace = parseApiNamespaceVersion(apiNamespace)
  if (!parsedNamespace) {
    return 'legacy_1_0_11'
  }

  return compareApiNamespaceVersions(parsedNamespace.version, FIRST_V1_1_0_VERSION) >= 0
    ? 'v1_1_0'
    : 'legacy_1_0_11'
}

export function resolveDefaultMingleBehaviorProfile(): MingleBehaviorProfile {
  if ((process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET || '').trim() === 'v1_1_0') {
    return 'v1_1_0'
  }

  return resolveMingleBehaviorProfile(process.env.NEXT_PUBLIC_API_NAMESPACE || '')
}

export function readRequestedApiNamespaceFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const rawValue = searchParams.apiNamespace ?? searchParams.apiNs
  if (typeof rawValue === 'string') return rawValue.trim()
  if (Array.isArray(rawValue)) return (rawValue[0] || '').trim()
  return ''
}
