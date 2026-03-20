import { describe, expect, it } from 'vitest'
import { getSpeakerAvatar } from './speaker-avatar'

describe('speaker-avatar', () => {
  it('scopes speaker avatars by session seed', () => {
    expect(getSpeakerAvatar('speaker-1').src).toBe('/avatars/animals/wild-boar.svg')
    expect(getSpeakerAvatar('speaker-1', 'avatar_seed_a').src).toBe('/avatars/animals/fox.svg')
    expect(getSpeakerAvatar('speaker-1', 'avatar_seed_b').src).toBe('/avatars/animals/cute-animals.svg')
  })
})
