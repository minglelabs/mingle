import { describe, expect, it } from 'vitest'
import { photoFileName } from './admin-photo-saver'

describe('saved photo name', () => {
  it('keeps the URL file name when it is an image name, else makes a .jpg one', () => {
    expect(photoFileName('/admin/operators/api/review/image/82d4.jpg?key=x')).toBe('82d4.jpg')
    expect(photoFileName('/admin/api/posts/p1/image', 'image/jpeg', 5)).toBe('hashchat-5.jpg')
    expect(photoFileName('https://cdn.example/a/b', 'image/png', 5)).toBe('hashchat-5.png')
  })
})
