const DEFAULT_API_NAMESPACE = ''
const ALLOWED_API_NAMESPACES = new Set([
  '',
  'android/v1.0.0',
  'android/v1.0.2',
  'android/v1.0.3',
  'android/v1.0.4',
  'android/v1.0.5',
  'ios/v1.0.0',
  'ios/v1.0.2',
  'ios/v1.0.3',
  'ios/v1.0.4',
  'ios/v1.0.5',
  'ios/v1.0.6',
])

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
const FINAL_SOURCE_REDETECTION_API_PATH_RE = /^\/api\/(?:android\/v1\.0\.(?:4|5)|ios\/v1\.0\.(?:4|5|6))\/translate\/finalize\/?$/

export function buildClientApiPath(endpoint: `/${string}`): string {
  const namespacePrefix = clientApiNamespace ? `/${clientApiNamespace}` : ''
  return `/api${namespacePrefix}${endpoint}`
}

export function shouldRedetectFinalizeSourceLanguage(pathname: string): boolean {
  return FINAL_SOURCE_REDETECTION_API_PATH_RE.test(pathname)
}
