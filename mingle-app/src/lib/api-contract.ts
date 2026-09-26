const DEFAULT_API_NAMESPACE = ''
const DEFAULT_API_NAMESPACE_BY_RELEASE_TARGET = {
  v1_1_0: {
    android: 'android/v1.1.0',
    ios: 'ios/v1.1.0',
  },
  v1_1_1: {
    android: 'android/v1.1.1',
    ios: 'ios/v1.1.1',
  },
  v1_1_2: {
    android: 'android/v1.1.2',
    ios: 'ios/v1.1.2',
  },
  v1_1_3: {
    android: 'android/v1.1.3',
    ios: 'ios/v1.1.3',
  },
  v1_1_4: {
    android: 'android/v1.1.4',
    ios: 'ios/v1.1.4',
  },
  v2_0_0: {
    android: 'android/v2.0.0',
    ios: 'ios/v2.0.0',
  },
  v2_1_0: {
    android: 'android/v2.1.0',
    ios: 'ios/v2.1.0',
  },
  v2_2_0: {
    android: 'android/v2.2.0',
    ios: 'ios/v2.2.0',
  },
} as const
type ReleaseTargetWithDefaultApiNamespace = keyof typeof DEFAULT_API_NAMESPACE_BY_RELEASE_TARGET
const VERSIONED_API_NAMESPACE_RULES = [
  { namespace: 'android/v1.0.0', enablesFinalizeSourceRedetection: false },
  { namespace: 'android/v1.0.2', enablesFinalizeSourceRedetection: false },
  { namespace: 'android/v1.0.3', enablesFinalizeSourceRedetection: false },
  { namespace: 'android/v1.0.4', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.0.5', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.0.6', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.0.7', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.0.8', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.0.9', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.0.10', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.0.11', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.1.0', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.1.1', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.1.2', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.1.3', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.1.4', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v2.0.0', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v2.0.1', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v2.0.2', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v2.0.3', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v2.0.4', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v2.1.0', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v2.2.0', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.0', enablesFinalizeSourceRedetection: false },
  { namespace: 'ios/v1.0.2', enablesFinalizeSourceRedetection: false },
  { namespace: 'ios/v1.0.3', enablesFinalizeSourceRedetection: false },
  { namespace: 'ios/v1.0.4', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.5', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.6', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.7', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.8', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.9', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.10', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.11', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.1.0', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.1.1', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.1.2', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.1.3', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.1.4', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v2.0.0', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v2.0.1', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v2.0.2', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v2.0.3', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v2.0.4', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v2.1.0', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v2.2.0', enablesFinalizeSourceRedetection: true },
] as const
const ALLOWED_API_NAMESPACES = new Set<string>([
  DEFAULT_API_NAMESPACE,
  ...VERSIONED_API_NAMESPACE_RULES.map(rule => rule.namespace),
])
const API_NAMESPACE_RULES_BY_NAMESPACE = new Map<string, (typeof VERSIONED_API_NAMESPACE_RULES)[number]>(
  VERSIONED_API_NAMESPACE_RULES.map(rule => [rule.namespace, rule]),
)

function normalizeApiNamespace(raw: string): string {
  return raw.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function parseAllowedApiNamespace(raw: string): string | null {
  const normalized = normalizeApiNamespace(raw)
  if (!normalized || !ALLOWED_API_NAMESPACES.has(normalized)) {
    return null
  }

  return normalized
}

function readApiNamespaceFromLocation(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const query = new URLSearchParams(window.location.search || '')
    const fromQuery = query.get('apiNamespace') || query.get('apiNs') || ''
    return parseAllowedApiNamespace(fromQuery)
  } catch {
    return null
  }
}

function normalizeReleaseTarget(raw: string): string {
  return raw.trim().toLowerCase()
}

function detectRuntimePlatform(): 'android' | 'ios' | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return null
  }

  const userAgent = navigator.userAgent || ''
  if (/android/i.test(userAgent)) {
    return 'android'
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return 'ios'
  }

  const platform = navigator.platform || ''
  if (/Mac/i.test(platform) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
    return 'ios'
  }

  return null
}

function resolveReleaseTargetDefaultApiNamespace(): string {
  const releaseTarget = normalizeReleaseTarget(process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET || '')
  const defaults = Object.prototype.hasOwnProperty.call(DEFAULT_API_NAMESPACE_BY_RELEASE_TARGET, releaseTarget)
    ? DEFAULT_API_NAMESPACE_BY_RELEASE_TARGET[releaseTarget as ReleaseTargetWithDefaultApiNamespace]
    : null

  if (!defaults) {
    return DEFAULT_API_NAMESPACE
  }

  const runtimePlatform = detectRuntimePlatform()
  if (runtimePlatform === 'android') {
    return defaults.android
  }
  return defaults.ios
}

const envNamespace = parseAllowedApiNamespace(process.env.NEXT_PUBLIC_API_NAMESPACE || '')
const queryNamespace = readApiNamespaceFromLocation()
const releaseTargetNamespace = parseAllowedApiNamespace(resolveReleaseTargetDefaultApiNamespace())

export const clientApiNamespace = queryNamespace || envNamespace || releaseTargetNamespace || DEFAULT_API_NAMESPACE

function parseVersionedApiNamespaceFromFinalizePath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/((?:android|ios)\/v\d+\.\d+\.\d+)\/translate\/finalize\/?$/)
  return match?.[1] ? normalizeApiNamespace(match[1]) : null
}

export function buildClientApiPath(endpoint: `/${string}`): string {
  const namespacePrefix = clientApiNamespace ? `/${clientApiNamespace}` : ''
  return `/api${namespacePrefix}${endpoint}`
}

/** First app release whose API namespace serves the posting feature. */
const POSTING_FEED_MIN_VERSION = [2, 2, 0] as const

/**
 * Whether a client on this API namespace can use the posting feature (feed,
 * compose, comments, unified notifications, post search, profile grid).
 *
 * The web UI is shared by every installed app version, but only namespaces from
 * 2.2.0 on serve the posting routes: an older app (e.g. `ios/v2.1.0`, rewritten
 * to v2.0.0) would get 404s from every posting call. The plain web client (the
 * '' namespace) calls the unversioned routes, which always exist. Every posting
 * entry point gates on this one rule.
 */
export function namespaceSupportsPostingFeed(namespace: string): boolean {
  const normalized = normalizeApiNamespace(namespace)
  if (!normalized) return true
  const match = normalized.match(/^(?:android|ios)\/v(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return false
  const version = [Number(match[1]), Number(match[2]), Number(match[3])]
  for (let index = 0; index < POSTING_FEED_MIN_VERSION.length; index += 1) {
    if (version[index] !== POSTING_FEED_MIN_VERSION[index]) {
      return version[index] > POSTING_FEED_MIN_VERSION[index]
    }
  }
  return true
}

/**
 * The rule applied to this client's namespace. Resolved at module load like
 * `clientApiNamespace`: on the server it reflects build-time env only, so a
 * server render must not trust it for a specific app — gate on the client, or
 * read the namespace from the request.
 */
export const clientSupportsPostingFeed = namespaceSupportsPostingFeed(clientApiNamespace)

export function shouldRedetectFinalizeSourceLanguage(pathname: string): boolean {
  const namespace = parseVersionedApiNamespaceFromFinalizePath(pathname)
  if (!namespace) return false
  return API_NAMESPACE_RULES_BY_NAMESPACE.get(namespace)?.enablesFinalizeSourceRedetection === true
}
