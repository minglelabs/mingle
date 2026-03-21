export interface SpeakerAvatar {
  name: string
  src: string
}

export const SPEAKER_AVATARS: SpeakerAvatar[] = [
  { name: 'Dinosaur', src: '/avatars/animals/dinosaur.svg' },
  { name: 'Crab', src: '/avatars/animals/crab.svg' },
  { name: 'Elk', src: '/avatars/animals/elk.svg' },
  { name: 'Jellyfish', src: '/avatars/animals/jellyfish.svg' },
  { name: 'Penguin', src: '/avatars/animals/penguin.svg' },
  { name: 'Cow', src: '/avatars/animals/the-cow.svg' },
  { name: 'Turtle', src: '/avatars/animals/turtle.svg' },
  { name: 'Bear', src: '/avatars/animals/bear.svg' },
  { name: 'Shrimp', src: '/avatars/animals/shrimp.svg' },
  { name: 'Rabbit', src: '/avatars/animals/rabbit.svg' },
  { name: 'Lion', src: '/avatars/animals/lion.svg' },
  { name: 'Squirrel', src: '/avatars/animals/squirrel.svg' },
  { name: 'Polar Bear', src: '/avatars/animals/polar-bear.svg' },
  { name: 'Raccoon', src: '/avatars/animals/raccoon.svg' },
  { name: 'Wild Boar', src: '/avatars/animals/wild-boar.svg' },
  { name: 'Crocodile', src: '/avatars/animals/crocodile.svg' },
  { name: 'Hedgehog', src: '/avatars/animals/hedgehog.svg' },
  { name: 'Fox', src: '/avatars/animals/fox.svg' },
  { name: 'Cute Animals', src: '/avatars/animals/cute-animals.svg' },
  { name: 'Whale', src: '/avatars/animals/whale.svg' },
]

function normalizeSpeakerKey(rawSpeaker?: string | null): string {
  return (rawSpeaker || '').trim().toLowerCase() || 'unknown-speaker'
}

function normalizeAvatarSeed(rawSeed?: string | null): string {
  return (rawSeed || '').trim().toLowerCase()
}

function hashSpeakerKey(speakerKey: string): number {
  let hash = 5381
  for (let i = 0; i < speakerKey.length; i += 1) {
    hash = ((hash << 5) + hash) ^ speakerKey.charCodeAt(i)
  }
  return hash >>> 0
}

function isValidSpeakerAvatarIndex(index?: number | null): index is number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < SPEAKER_AVATARS.length
}

function createSeededRandom(seed: string): () => number {
  let state = hashSpeakerKey(seed) || 0x9e3779b9
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

export function buildSpeakerAvatarIndexPool(rawSeed?: string | null): number[] {
  const avatarSeed = normalizeAvatarSeed(rawSeed) || 'speaker-avatar-default'
  const nextRandom = createSeededRandom(avatarSeed)
  const indexes = SPEAKER_AVATARS.map((_, index) => index)

  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1))
    ;[indexes[i], indexes[j]] = [indexes[j], indexes[i]]
  }

  return indexes
}

export function assignSpeakerAvatarIndex(
  rawSpeaker: string | null | undefined,
  assignments: Record<string, number>,
  rawSeed?: string | null,
): { speakerKey: string, avatarIndex: number } {
  const speakerKey = normalizeSpeakerKey(rawSpeaker)
  const existingIndex = assignments[speakerKey]
  if (isValidSpeakerAvatarIndex(existingIndex)) {
    return { speakerKey, avatarIndex: existingIndex }
  }

  const usedIndexes = new Set(
    Object.values(assignments).filter((index): index is number => isValidSpeakerAvatarIndex(index)),
  )
  const nextIndex = buildSpeakerAvatarIndexPool(rawSeed).find((index) => !usedIndexes.has(index))
  if (isValidSpeakerAvatarIndex(nextIndex)) {
    return { speakerKey, avatarIndex: nextIndex }
  }

  const avatarSeed = normalizeAvatarSeed(rawSeed)
  const overflowKey = avatarSeed ? `${avatarSeed}::${speakerKey}::overflow` : `${speakerKey}::overflow`
  return { speakerKey, avatarIndex: hashSpeakerKey(overflowKey) % SPEAKER_AVATARS.length }
}

export function getSpeakerAvatar(
  rawSpeaker?: string | null,
  rawSeed?: string | null,
  avatarIndex?: number | null,
): SpeakerAvatar {
  if (isValidSpeakerAvatarIndex(avatarIndex)) {
    return SPEAKER_AVATARS[avatarIndex]
  }
  const speakerKey = normalizeSpeakerKey(rawSpeaker)
  const avatarSeed = normalizeAvatarSeed(rawSeed)
  const scopedSpeakerKey = avatarSeed ? `${avatarSeed}::${speakerKey}` : speakerKey
  const index = hashSpeakerKey(scopedSpeakerKey) % SPEAKER_AVATARS.length
  return SPEAKER_AVATARS[index]
}
