import { describe, expect, it } from 'vitest'
import { adminProfileHref } from './profile-href'

describe('adminProfileHref', () => {
  it('opens the profile inside the admin, never the app share link', () => {
    expect(adminProfileHref('u 1')).toBe('/admin/operators/u%201/profile')
    expect(adminProfileHref('u1', '/admin/activity/posts/p1?as=op')).toBe('/admin/operators/u1/profile?back=%2Fadmin%2Factivity%2Fposts%2Fp1%3Fas%3Dop')
  })
})
