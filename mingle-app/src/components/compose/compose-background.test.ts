import { describe, expect, it } from 'vitest'
import { getBackgroundKeys } from '@/lib/post-backgrounds'
import { nextBackgroundKey } from './compose-background'

describe('nextBackgroundKey', () => {
  it('always returns a key different from the current one', () => {
    const keys = getBackgroundKeys()
    for (const key of keys) {
      for (let i = 0; i < 50; i++) {
        expect(nextBackgroundKey(key)).not.toBe(key)
      }
    }
  })

  it('returns a valid catalog key', () => {
    const keys = new Set(getBackgroundKeys())
    for (const key of getBackgroundKeys()) {
      expect(keys.has(nextBackgroundKey(key))).toBe(true)
    }
  })
})
