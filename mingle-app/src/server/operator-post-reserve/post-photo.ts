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

// Staff want far more photos with people in them, face shown or not, and fewer food shots (2026-11).
// Staff 2026-11-23: about 71 % of post photos were the poster alone (selfie or
// faceless), which read as a feed of selfies; now half, and scenes (food, a view,
// a thing) went from 15 to 34 %.
export const POST_PHOTO_KINDS: ReadonlyArray<{ key: PostPhotoKind; weight: number }> = [
  { key: 'self', weight: 35 },
  { key: 'self_faceless', weight: 15 },
  { key: 'self_back', weight: 6 },
  { key: 'friends', weight: 10 },
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
    // More selfies: they are most of what people post of themselves.
    'a close front-camera selfie from slightly above, the face filling most of the frame, a soft smile',
    'a front-camera selfie by a window in daylight, the head tilted a little',
    'a front-camera selfie in the street with a peace sign or a small wave',
    'a front-camera selfie in a shop, a mall or a bookstore, shelves and lights behind',
    'a front-camera selfie in a car or a taxi back seat, the seatbelt across the shoulder',
    'a front-camera selfie after getting ready to go out, standing in the hallway or by the door',
    // Staff 2026-11-23: the most real-looking photo so far was a plain car selfie. A small,
    // simple place close behind the poster, with one ordinary light, looks real far more often.
    'a close front-camera selfie in the driver\'s or passenger seat of a parked car, daylight from the side window, only the seat, the belt and the door behind',
    'a close front-camera selfie at a bus or train window seat, the seat back and the window right behind',
    'a close front-camera selfie at their desk, a plain wall or a shelf right behind',
    'a close front-camera selfie on the sofa or the bed against a plain wall, room light only',
    'a close front-camera selfie in an elevator or a stairwell, plain walls right behind',
    // Staff 2026-11-24: a friend's shot of the poster busy with something, not looking at the camera.
    'a friend took it while the poster was busy with something at a table (choosing from a menu, opening a box, pouring a drink), eyes down, not looking at the camera',
    'a friend took it while the poster was absorbed in something in a shop or a room (trying something on, looking through things), turned partly away from the camera',
  ],
  // Staff 2026-11-24: far too many top-down shots of the poster's own feet and legs; none now.
  self_faceless: [
    'a mirror selfie where the phone covers the face, the full outfit visible',
    'shoulders down, sitting at a café holding a drink, the face cut off by the top of the frame',
    'a friend took it from a few steps away: the poster from the shoulders down, standing at a counter, a railing or a shop window, the place around them',
    'their hands holding food, a book, a ticket or a shopping bag, sleeves and part of the outfit in frame',
    'a friend took it: the poster turned away, or the face hidden behind a hand, a cap brim or hair',
    'sitting by a window or on a bench, cropped at the chin, the place around them in focus',
    // Staff 2026-11-24: hands holding up a little find of the day over the place, shot from above.
    'their hand holding up something small they just found or got (a fallen ginkgo or maple leaf, a flower, a ticket, a snack, a ring), seen from above with the ground or the table of the place below, a sleeve and nails in frame',
    // Faces never show here, so it sits with the faceless photos rather than the group ones.
    'only the hands of the poster and a friend, each holding up the same kind of thing side by side (ginkgo leaves, ice creams, drinks, matching keychains, rings), seen from above with the street or the table below; no faces in frame, two different sleeves and nails',
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
const PLACE_MARKER = /^\[at: ([^\]]{1,120})\]\s*/

/**
 * The stored photo description: the kind as a leading tag, so the drawing step
 * knows who is in it, and, for a photo taken away from the author's city (a
 * trip to Korea), the place as `[at: …]`.
 */
/**
 * A self-intro photo post that shows the account's own profile photo (staff
 * 2026-11-24: people often post their profile photo with a two-line intro).
 * The description keeps a drawable fallback after the marker, for an account
 * whose profile photo shows no face and for a redraw.
 */
export const PROFILE_PHOTO_MARKER = '(the profile photo) '

/**
 * A self photo-booth print (Korean 인생네컷 style): four shots of the poster in
 * one print (staff 2026-11-24). The description from the post generator names
 * the booth's backdrop, the frame and any props; the poses are picked when the
 * photo is drawn.
 */
export const PHOTO_BOOTH_MARKER = '(photo booth) '
export const PHOTO_BOOTH_SETUP = 'a self photo-booth print (the Korean 인생네컷 kind) of the poster alone: four shots in one print; describe only the booth backdrop color, the print frame color and any booth props or the outfit (fully and ordinarily dressed), not the poses'

export const INTRO_PHOTO_SETUP = 'their best, most flattering recent photo of themself, the one they would pick to introduce themself: clear, well lit, the face plainly visible, looking good'

export function encodePostPhoto(kind: PostPhotoKind, description: string, place: string | null = null): string {
  const at = place ? `[at: ${place.replace(/[\[\]]/g, '').trim()}] ` : ''
  return kind === 'scene' ? `${at}${description}` : `[${kind}] ${at}${description}`
}

/** A stored description split into kind, place and text. Untagged (older) descriptions are scenes in the author's city. */
export function decodePostPhoto(stored: string): { kind: PostPhotoKind; description: string; place: string | null; profilePhoto: boolean; photoBooth: boolean } {
  const match = MARKER.exec(stored)
  const kind = match ? match[1] as PostPhotoKind : 'scene'
  const rest = match ? stored.slice(match[0].length) : stored
  const at = PLACE_MARKER.exec(rest)
  const text = at ? rest.slice(at[0].length) : rest
  const profilePhoto = text.startsWith(PROFILE_PHOTO_MARKER)
  const photoBooth = text.startsWith(PHOTO_BOOTH_MARKER)
  const description = profilePhoto ? text.slice(PROFILE_PHOTO_MARKER.length) : photoBooth ? text.slice(PHOTO_BOOTH_MARKER.length) : text
  return { kind, description, place: at ? at[1].trim() : null, profilePhoto, photoBooth }
}
