import { describe, expect, it } from 'vitest'

import {
  normalizeRuntimeBoolean,
  readPreferredRuntimeBoolean,
} from '../../rn/src/runtimeConfig'

describe('runtime config boolean helpers', () => {
  it('parses truthy and falsy runtime booleans', () => {
    expect(normalizeRuntimeBoolean(' true ')).toBe(true)
    expect(normalizeRuntimeBoolean('0')).toBe(false)
    expect(normalizeRuntimeBoolean(true)).toBe(true)
    expect(normalizeRuntimeBoolean(false)).toBe(false)
    expect(normalizeRuntimeBoolean(undefined)).toBeNull()
  })

  it('prefers native runtime booleans over env booleans', () => {
    expect(readPreferredRuntimeBoolean('1', '0')).toBe(true)
    expect(readPreferredRuntimeBoolean('false', 'true')).toBe(false)
  })

  it('falls back to env booleans when the native value is missing', () => {
    expect(readPreferredRuntimeBoolean(undefined, 'true')).toBe(true)
    expect(readPreferredRuntimeBoolean('', '0')).toBe(false)
  })
})
