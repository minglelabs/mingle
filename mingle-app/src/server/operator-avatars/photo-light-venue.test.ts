import { describe, expect, it } from 'vitest'
import { lightFitsScene, pickPhotoTime } from './photo-realism'

describe('light lines that name a place', () => {
  it('go only to a photo of that kind of place', () => {
    const cafe = '[self] A front-camera selfie at a small wooden café table inside a quiet Yeonnam-dong café'
    for (let i = 0; i < 200; i += 1) {
      const light = pickPhotoTime(() => i / 200, cafe)
      expect(light ?? '').not.toMatch(/barbecue|exhaust|pub|karaoke|ramen/i)
    }
    expect(lightFitsScene('a Korean barbecue place: bright fluorescent light', cafe)).toBe(false)
    expect(lightFitsScene('a café window seat in morning sun', cafe)).toBe(true)
  })

  it('leave weather and window light to any place', () => {
    expect(lightFitsScene('a cloudy but bright day, even white-grey sky', 'a street corner')).toBe(true)
    expect(lightFitsScene('sheer white curtains diffusing strong daylight', '[self] at their desk at home')).toBe(true)
  })
})
