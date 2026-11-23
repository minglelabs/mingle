import { describe, expect, it } from 'vitest'
import { adminPostImageUrl, reviewImageUrl } from './review-image-url'

// Chrome names a photo dragged out of the page after the URL's last path part;
// Instagram's uploader rejects one without a .jpg extension.
describe('admin photo URLs', () => {
  it('end the path in a .jpg file name', () => {
    const review = reviewImageUrl('post-images/u1/abc-123.jpg')
    expect(new URL(review, 'https://x.test').pathname).toBe('/admin/operators/api/review/image/abc-123.jpg')
    expect(review).toContain('key=post-images%2Fu1%2Fabc-123.jpg')
    expect(new URL(adminPostImageUrl('rs-cmwsw7brh0001shxu6jgvlsdv'), 'https://x.test').pathname).toMatch(/\/image\/hashchat-[\w-]+\.jpg$/)
    expect(adminPostImageUrl('p1', '?candidate=k')).toMatch(/\.jpg\?candidate=k$/)
  })
})
