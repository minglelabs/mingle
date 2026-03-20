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

function hashSpeakerKey(speakerKey: string): number {
  let hash = 5381
  for (let i = 0; i < speakerKey.length; i += 1) {
    hash = ((hash << 5) + hash) ^ speakerKey.charCodeAt(i)
  }
  return hash >>> 0
}

export function getSpeakerAvatar(rawSpeaker?: string | null): SpeakerAvatar {
  const speakerKey = normalizeSpeakerKey(rawSpeaker)
  const index = hashSpeakerKey(speakerKey) % SPEAKER_AVATARS.length
  return SPEAKER_AVATARS[index]
}
