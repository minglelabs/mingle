const DEFAULT_API_NAMESPACE = ''
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
  { namespace: 'android/v1.0.12', enablesFinalizeSourceRedetection: true },
  { namespace: 'android/v1.0.13', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.0', enablesFinalizeSourceRedetection: false },
  { namespace: 'ios/v1.0.2', enablesFinalizeSourceRedetection: false },
  { namespace: 'ios/v1.0.3', enablesFinalizeSourceRedetection: false },
  { namespace: 'ios/v1.0.4', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.5', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.6', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.7', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.8', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.9', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.12', enablesFinalizeSourceRedetection: true },
  { namespace: 'ios/v1.0.13', enablesFinalizeSourceRedetection: true },
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

const envNamespace = parseAllowedApiNamespace(process.env.NEXT_PUBLIC_API_NAMESPACE || '')
const queryNamespace = readApiNamespaceFromLocation()

export const clientApiNamespace = queryNamespace || envNamespace || DEFAULT_API_NAMESPACE

function parseVersionedApiNamespaceFromFinalizePath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/((?:android|ios)\/v\d+\.\d+\.\d+)\/translate\/finalize\/?$/)
  return match?.[1] ? normalizeApiNamespace(match[1]) : null
}

export function buildClientApiPath(endpoint: `/${string}`): string {
  const namespacePrefix = clientApiNamespace ? `/${clientApiNamespace}` : ''
  return `/api${namespacePrefix}${endpoint}`
}

export function shouldRedetectFinalizeSourceLanguage(pathname: string): boolean {
  const namespace = parseVersionedApiNamespaceFromFinalizePath(pathname)
  if (!namespace) return false
  return API_NAMESPACE_RULES_BY_NAMESPACE.get(namespace)?.enablesFinalizeSourceRedetection === true
}
