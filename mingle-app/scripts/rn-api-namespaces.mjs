export const EXPECTED_RN_API_NAMESPACE_BY_OS = {
  ios: 'ios/v1.1.1',
  android: 'android/v1.1.1',
}

export function normalizeNamespace(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}
