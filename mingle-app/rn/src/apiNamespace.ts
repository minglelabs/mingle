export const EXPECTED_API_NAMESPACE_BY_OS = {
  android: 'android/v1.1.1',
  ios: 'ios/v1.1.1',
} as const

export type ApiNamespaceVersion = {
  platform: 'android' | 'ios'
  version: readonly [number, number, number]
}

export function normalizeApiNamespace(raw: string): string {
  return raw.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

export function parseApiNamespaceVersion(rawNamespace: string): ApiNamespaceVersion | null {
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

export function compareApiNamespaceVersions(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue
    return left[index] > right[index] ? 1 : -1
  }

  return 0
}

export function resolveExpectedApiNamespace(runtimeOs: string): string {
  if (runtimeOs === 'android') return EXPECTED_API_NAMESPACE_BY_OS.android
  if (runtimeOs === 'ios') return EXPECTED_API_NAMESPACE_BY_OS.ios
  return ''
}

export function validateRnApiNamespace(params: {
  runtimeOs: string
  configuredApiNamespace: string
}): {
  expectedApiNamespace: string
  configuredApiNamespace: string
  validatedApiNamespace: string
} {
  const expectedApiNamespace = resolveExpectedApiNamespace(params.runtimeOs)
  const configuredApiNamespace = normalizeApiNamespace(params.configuredApiNamespace)
  const validatedApiNamespace =
    expectedApiNamespace &&
    configuredApiNamespace &&
    configuredApiNamespace === expectedApiNamespace
      ? configuredApiNamespace
      : ''

  return {
    expectedApiNamespace,
    configuredApiNamespace,
    validatedApiNamespace,
  }
}
