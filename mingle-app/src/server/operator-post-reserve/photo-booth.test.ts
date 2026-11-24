import { describe, expect, it } from 'vitest'
import { buildPostImagePrompt } from './post-image'
import { decodePostPhoto, encodePostPhoto, PHOTO_BOOTH_MARKER } from './post-photo'

describe('photo-booth prints (인생네컷)', () => {
  const stored = encodePostPhoto('self', `${PHOTO_BOOTH_MARKER}a pink backdrop, white frame, a bunny-ear headband`)

  it('keep the marker out of the description', () => {
    expect(decodePostPhoto(stored)).toMatchObject({ kind: 'self', photoBooth: true, description: 'a pink backdrop, white frame, a bunny-ear headband' })
  })

  it('draw four different ordinary booth poses of one dressed person', () => {
    const prompt = buildPostImagePrompt(stored, 'Seoul, South Korea', () => 0.3, { look: 'a Korean woman in her twenties', hasReference: false, gender: 'female' })
    expect(prompt).toContain('photo-booth print')
    expect(prompt).toMatch(/1\) .+; 2\) .+; 3\) .+; 4\) /)
    expect(prompt).toContain('Fully and ordinarily dressed in every shot')
    expect(prompt).toContain('The poster: a Korean woman in her twenties.')
  })
})
