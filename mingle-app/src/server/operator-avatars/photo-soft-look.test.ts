import { describe, expect, it } from 'vitest'
import { phonePhotoRealism, SOFT_LOOK } from './photo-realism'

describe('soft hazy look', () => {
  it('goes on some post photos and lets the lights glow', () => {
    const prompt = phonePhotoRealism(() => 0, { people: true, focusOnPerson: true, pickTime: true, scene: 'night street' })
    expect(prompt).toContain(SOFT_LOOK)
    expect(prompt).not.toContain('excessive bloom')
  })

  it('stays off the rest of the post photos and off avatars', () => {
    expect(phonePhotoRealism(() => 0.99, { people: true, pickTime: true, scene: 'night street' })).not.toContain(SOFT_LOOK)
    expect(phonePhotoRealism(() => 0, { people: true, scene: 'night street' })).not.toContain(SOFT_LOOK)
  })
})
