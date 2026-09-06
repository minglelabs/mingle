// These namespaces share the v2.0.0 handlers in next.config.mjs. Extend this
// allowlist only after verifying the queued payload contract for a new release.
const COMPATIBLE_NAMESPACES = [
  ['ios/v2.0.0', 'ios/v2.0.1', 'ios/v2.0.2', 'ios/v2.0.3'],
  ['android/v2.0.0', 'android/v2.0.1'],
] as const

export function compatiblePendingWorkNamespaces(namespace: string): readonly string[] {
  return COMPATIBLE_NAMESPACES.find(group => (group as readonly string[]).includes(namespace)) ?? [namespace]
}
