import { describe, expect, it } from 'vitest'
import { compatiblePendingWorkNamespaces } from './pending-work-api-namespace'

describe('2.0.3 pending-work upgrade compatibility', () => {
  it.each(['android', 'ios'])('recovers older %s 2.x work without adopting another platform', platform => {
    const namespaces = compatiblePendingWorkNamespaces(`${platform}/v2.0.3`)
    expect(namespaces).toEqual([`${platform}/v2.0.0`, `${platform}/v2.0.1`, `${platform}/v2.0.2`, `${platform}/v2.0.3`])
    expect(namespaces.every(namespace => namespace.startsWith(`${platform}/`))).toBe(true)
  })
  it('does not migrate unknown contracts', () => {
    expect(compatiblePendingWorkNamespaces('android/v3.0.0')).toEqual(['android/v3.0.0'])
  })
})
