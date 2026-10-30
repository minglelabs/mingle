import { describe, expect, it } from 'vitest'
import { reserveExtraImages } from './extra-images'

describe('reserveExtraImages', () => {
  it('keeps valid post-image entries in order, deduped', () => {
    expect(reserveExtraImages([
      { objectKey: 'post-images/u/a.jpg', width: 800, height: 1000 },
      { objectKey: 'post-images/u/a.jpg', width: 1, height: 1 },
      { objectKey: 'other/b.jpg' },
      'x',
      { objectKey: 'post-images/u/c.jpg', width: -1 },
    ])).toEqual([
      { objectKey: 'post-images/u/a.jpg', width: 800, height: 1000 },
      { objectKey: 'post-images/u/c.jpg', width: null, height: null },
    ])
  })

  it('reads anything else as none and caps at nine', () => {
    expect(reserveExtraImages(null)).toEqual([])
    expect(reserveExtraImages(Array.from({ length: 12 }, (_, i) => ({ objectKey: `post-images/u/${i}.jpg` })))).toHaveLength(9)
  })
})
