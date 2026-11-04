import { describe, expect, it } from 'vitest'
import { safeBackPath, withBack } from './back-path'

describe('safeBackPath', () => {
  it('keeps an in-admin path with its query', () => {
    expect(safeBackPath('/admin/operators/review?after=abc')).toBe('/admin/operators/review?after=abc')
    expect(safeBackPath(['/admin/operators/u1/profile?tab=review', '/x'])).toBe('/admin/operators/u1/profile?tab=review')
  })

  it('refuses anything that leaves the admin', () => {
    for (const value of [undefined, '', '/feed', '//evil.com/admin/x', 'https://evil.com/admin/x', '/admin/\\evil', `/admin/${'a'.repeat(700)}`]) {
      expect(safeBackPath(value)).toBeNull()
    }
  })
})

describe('withBack', () => {
  it('adds the screen to return to, whether or not the address has a query', () => {
    expect(withBack('/admin/operators/u1', '/admin/operators/review?after=a b')).toBe('/admin/operators/u1?back=%2Fadmin%2Foperators%2Freview%3Fafter%3Da%20b')
    expect(withBack('/admin/operators/u1?from=review', '/admin/operators/review')).toBe('/admin/operators/u1?from=review&back=%2Fadmin%2Foperators%2Freview')
  })
})
