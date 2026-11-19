import { describe, expect, it } from 'vitest'
import { postImageThumbnailUrl } from './post-image-thumbnail'

describe('postImageThumbnailUrl', () => {
  it('asks the post image route for the small copy', () => {
    expect(postImageThumbnailUrl('/api/posts/p1/image?v=abc')).toBe('/api/posts/p1/image?v=abc&size=thumb')
    expect(postImageThumbnailUrl('/api/posts/p1/image')).toBe('/api/posts/p1/image?size=thumb')
    expect(postImageThumbnailUrl('/api/ios/v2.2.0/posts/p1/image?v=abc&index=2')).toBe('/api/ios/v2.2.0/posts/p1/image?v=abc&index=2&size=thumb')
  })

  it('leaves other urls, and a url that already says a size, alone', () => {
    expect(postImageThumbnailUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg')
    expect(postImageThumbnailUrl('/api/posts/p1/comments/c1/image?v=1')).toBe('/api/posts/p1/comments/c1/image?v=1')
    expect(postImageThumbnailUrl('/api/posts/p1/image?v=abc&size=thumb')).toBe('/api/posts/p1/image?v=abc&size=thumb')
  })
})
