import { describe, expect, it } from 'vitest'
import {
  assignSpeakerAvatarIndex,
  buildSpeakerAvatarIndexPool,
  getSpeakerAvatar,
  SPEAKER_AVATARS,
} from './speaker-avatar'

describe('speaker-avatar', () => {
  it('scopes speaker avatars by session seed', () => {
    expect(getSpeakerAvatar('speaker-1').src).toBe('/avatars/animals/the-cow.svg')
    expect(getSpeakerAvatar('speaker-1', 'avatar_seed_a').src).toBe('/avatars/animals/rabbit.svg')
    expect(getSpeakerAvatar('speaker-1', 'avatar_seed_b').src).toBe('/avatars/animals/crab.svg')
  })

  it('builds a deterministic shuffled pool per session seed', () => {
    const poolA = buildSpeakerAvatarIndexPool('avatar_seed_a')
    const poolB = buildSpeakerAvatarIndexPool('avatar_seed_a')
    const poolC = buildSpeakerAvatarIndexPool('avatar_seed_b')

    expect(poolA).toEqual(poolB)
    expect(poolA).not.toEqual(poolC)
    expect(poolA).toHaveLength(SPEAKER_AVATARS.length)
    expect(new Set(poolA).size).toBe(SPEAKER_AVATARS.length)
  })

  it('assigns unique avatar indexes within a session before reuse', () => {
    const assignments: Record<string, number> = {}
    const indexes = ['speaker-1', 'speaker-2', 'speaker-3', 'speaker-4'].map((speaker) => {
      const { speakerKey, avatarIndex } = assignSpeakerAvatarIndex(speaker, assignments, 'avatar_seed_a')
      assignments[speakerKey] = avatarIndex
      return avatarIndex
    })

    expect(new Set(indexes).size).toBe(4)
  })
})
