export const EXPECTED_RN_API_NAMESPACE_BY_OS = {
  ios: 'ios/v2.4.3',
  android: 'android/v2.4.3',
}

export function normalizeNamespace(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}
