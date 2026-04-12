type ApiNamespaceVersion = {
  platform: 'android' | 'ios'
  version: readonly [number, number, number]
}

const SILENCE_SLIDER_LOCK_THRESHOLD: readonly [number, number, number] = [1, 0, 4]

function normalizeApiNamespace(raw: string): string {
  return raw.trim().replace(/^\/+/, '').replace(/\/+$/, '')
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

export function isLegacySonioxSilenceSliderNamespace(rawNamespace: string): boolean {
  const parsed = parseApiNamespaceVersion(rawNamespace)
  if (!parsed) return false

  return compareApiNamespaceVersions(parsed.version, SILENCE_SLIDER_LOCK_THRESHOLD) <= 0
}
