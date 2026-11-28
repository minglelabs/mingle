import { describe, expect, it } from 'vitest'
import { namespaceSupportsVoiceTalk } from './api-contract'

describe('namespaceSupportsVoiceTalk', () => {
  it('is only for apps from 2.5.0 on (older apps have the bridge but no voice host)', () => {
    expect(namespaceSupportsVoiceTalk('ios/v2.5.0')).toBe(true)
    expect(namespaceSupportsVoiceTalk('android/v2.5.0')).toBe(true)
    expect(namespaceSupportsVoiceTalk('ios/v2.6.0')).toBe(true)
    expect(namespaceSupportsVoiceTalk('ios/v2.6.1')).toBe(true)
    expect(namespaceSupportsVoiceTalk('ios/v2.4.3')).toBe(false)
    expect(namespaceSupportsVoiceTalk('android/v2.4.2')).toBe(false)
    expect(namespaceSupportsVoiceTalk('')).toBe(false)
  })
})
