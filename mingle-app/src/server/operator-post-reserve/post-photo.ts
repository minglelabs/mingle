/**
 * What kind of photo a latent post carries. People post photos of themselves
 * far more than of anything else (HelloTalk, Instagram), so most photos have
 * the poster in them: face shown, face out of frame, from behind, or with
 * friends. The code picks the kind and a setup (who took it, framing, pose,
 * place); the post generator turns that into one concrete description and a
 * caption that fits it.
 */
type Random = () => number

export type PostPhotoKind = 'self' | 'self_faceless' | 'self_back' | 'friends' | 'scene'

export const POST_PHOTO_KINDS: ReadonlyArray<{ key: PostPhotoKind; weight: number }> = [
  { key: 'self', weight: 24 },
  { key: 'self_faceless', weight: 18 },
  { key: 'self_back', weight: 10 },
  { key: 'friends', weight: 14 },
  { key: 'scene', weight: 34 },
]

/** Setups for each kind with the poster in it, written as briefs for the post generator. */
const SETUPS: Record<Exclude<PostPhotoKind, 'scene'>, readonly string[]> = {
  self: [
    'a friend took it: the poster stands posed on a rooftop, a terrace or a street corner, one hand in their hair or on their bag, with an ordinary messy backdrop behind (power lines, rooftops, signs, a parked scooter)',
    'a friend took it from a few steps away: the poster sits on steps, a low wall or a bench, glancing off to the side; the place fills most of the frame and the person is small in it',
    'a friend took it across the table at a café or restaurant, the poster mid-laugh or mid-bite',
    'a front-camera selfie on the subway, a bus or a train, the seats and windows behind',
    'a front-camera selfie at a café table, the drink in the corner of the frame',
    'a front-camera selfie outdoors with the street or a view behind, hair a little out of place',
    'a mirror selfie in an elevator, a lift lobby or a shop fitting room, the phone held at chest height so the face shows',
    'a friend took a candid while walking, the poster half turned toward the camera',
    'a friend took it at a viewpoint, a park or a riverside, the poster in the lower half of the frame, smiling at the camera',
    'a front-camera selfie at home or in a dorm room, lying on the bed or sitting at the desk, relaxed and unbothered',
  ],
  self_faceless: [
    'shot looking down at their own outfit and shoes, the phone held high, the face out of frame above',
    'a mirror selfie where the phone covers the face, the full outfit visible',
    'shoulders down, sitting at a café holding a drink, the face cut off by the top of the frame',
    'their legs and shoes on a street, stairs or a crosswalk',
    'their hands holding food, a book, a ticket or a shopping bag, sleeves and part of the outfit in frame',
    'a friend took it: the poster turned away, or the face hidden behind a hand, a cap brim or hair',
    'sitting by a window or on a bench, cropped at the chin, the place around them in focus',
  ],
  self_back: [
    'a friend took it from behind: the poster walks down a street or an alley ahead of the camera',
    'from behind: the poster stands at a viewpoint, a railing or the water, looking out',
    'from behind: the poster sits on a bench or steps, the view in front of them',
    'from behind and a little to the side: the poster looks into a shop window or at a sign',
  ],
  friends: [
    'a front-camera group selfie of the poster and one or two friends, squeezed into the frame',
    'the poster and a friend posed side by side, taken by someone else, the place behind them',
    'the poster with friends around a restaurant or bar table, food and drinks in front, someone mid-laugh',
    'cheers over a table with cups or glasses, the faces of the poster and friends partly in frame',
    'friends walking ahead on a street, the poster turning back toward the camera with them',
    'the poster and a friend at a photo booth or with a dessert they are sharing, both making a silly face',
  ],
}

function pickWeighted<T extends { weight: number }>(options: readonly T[], random: Random): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0)
  let roll = random() * total
  for (const option of options) {
    roll -= option.weight
    if (roll < 0) return option
  }
  return options[options.length - 1]
}

export type PostPhotoPlan = { kind: PostPhotoKind; setup: string | null }

/** The kind of photo for one post, and for photos with the poster in them, its setup. */
export function pickPostPhoto(random: Random): PostPhotoPlan {
  const kind = pickWeighted(POST_PHOTO_KINDS, random).key
  if (kind === 'scene') return { kind, setup: null }
  const setups = SETUPS[kind]
  return { kind, setup: setups[Math.floor(random() * setups.length)] }
}

const MARKER = /^\[(self|self_faceless|self_back|friends)\]\s*/

/** The stored photo description: the kind as a leading tag, so the drawing step knows who is in it. */
export function encodePostPhoto(kind: PostPhotoKind, description: string): string {
  return kind === 'scene' ? description : `[${kind}] ${description}`
}

/** A stored description split into kind and text. Untagged (older) descriptions are scenes. */
export function decodePostPhoto(stored: string): { kind: PostPhotoKind; description: string } {
  const match = MARKER.exec(stored)
  return match ? { kind: match[1] as PostPhotoKind, description: stored.slice(match[0].length) } : { kind: 'scene', description: stored }
}
