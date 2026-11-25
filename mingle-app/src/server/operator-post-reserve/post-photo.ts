/**
 * What kind of photo a latent post carries. People post photos of themselves
 * far more than of anything else (HelloTalk, Instagram), so most photos have
 * the poster in them: face shown, face out of frame, from behind, or with
 * friends. The code picks the kind and a setup (who took it, framing, pose,
 * place); the post generator turns that into one concrete description and a
 * caption that fits it.
 */
import { pickMirrorSelfie } from '@/server/operator-avatars/mirror-places'
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

/**
 * Photos of the poster taken from far away, the face small in the frame
 * (staff, 2026-11-25: nearly every face photo came out at the same close
 * distance). A self photo is one of these about two times in five.
 */
export const FAR_SELF_SHARE = 0.4
const FAR_SELF_SETUPS: readonly string[] = [
  'a friend took it from across the street: the poster stands on the far sidewalk, full body and small in the frame, shop fronts, signs and passing people around them',
  'a friend took it from far back in a park or a riverside path: the poster small in the middle of the wide view, trees, the path and the sky filling most of the frame',
  'a friend took it from the other end of a plaza, a pier or a bridge, the poster small and full body, the place huge around them, zoomed in a little so the background looks compressed',
  'a friend took it from far away at a beach or a lake: the poster a small figure at the water\'s edge, the horizon across the frame',
  'a friend took it from the bottom of a long staircase or a slope: the poster small near the top, the steps leading up to them',
  'a friend took it from across a wide street crossing or an alley, the poster full body waiting or walking, cars, signs and wires around',
  'a friend took it from far across a café, a station hall or a mall atrium: the poster small at a table or by a pillar, the whole room in view',
  'a friend took it from far away at a viewpoint or a rooftop: the poster small at the railing, the city or the view spread out around them',
  'a friend took it from a distance in a market street or a festival crowd: the poster full body in the middle, stalls, lanterns and people around',
  'a friend took it from far back on a campus lawn or in a plaza: the poster sitting or standing small in the frame, buildings behind',
]

/** Stand-ins in SETUPS for a mirror selfie, filled in with a place and framing when picked (mirror-places.ts). */
const MIRROR_SELF = '<mirror selfie, face shown>'
const MIRROR_FACELESS = '<mirror selfie, face covered>'

/** Setups for each kind with the poster in it, written as briefs for the post generator. */
const SETUPS: Record<Exclude<PostPhotoKind, 'scene'>, readonly string[]> = {
  self: [
    'a friend took it: the poster stands posed on a rooftop, a terrace or a street corner, one hand in their hair or on their bag, with an ordinary messy backdrop behind (power lines, rooftops, signs, a parked scooter)',
    'a friend took it from a few steps away: the poster sits on steps, a low wall or a bench, glancing off to the side; the place fills most of the frame and the person is small in it',
    'a friend took it across the table at a café or restaurant, the poster mid-laugh or mid-bite',
    'a front-camera selfie on the subway, a bus or a train, the seats and windows behind',
    'a front-camera selfie at a café table, the drink in the corner of the frame',
    'a front-camera selfie outdoors with the street or a view behind, hair a little out of place',
    MIRROR_SELF,
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
    MIRROR_FACELESS,
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

/**
 * How a photo without the poster is framed (staff 2026-11-24: a samgyeopsal
 * table shot from the seat, grill, side dishes and drinks all in frame, is the
 * kind of photo people really post). Each scene photo gets one; the post
 * generator fills in what it shows.
 */
export const SCENE_SETUPS: readonly string[] = [
  'the whole table from where they sit, at a slant: the main dish (a grill, a pot, a big plate) in the middle and the side dishes, sauces, lettuce or bread, drinks in glasses and someone\'s phone around it, a corner cut off by the frame',
  'one dish or drink close up from above, filling most of the frame, a bit of the table and a hand or chopsticks at the edge',
  'a drink or a snack held up in one hand against the place behind it',
  'food on the grill or in the pot while it cooks, steam rising, tongs or a ladle in frame',
  'a shop, café or restaurant front or sign from across the street, people passing',
  'the view from where they stand or sit: a street, a park, a river or rooftops, a railing or a window frame in the foreground',
  'a corner of their room or desk with the things on it as they are',
  'a pet or a street cat close up, at its eye level',
  'something small that caught their eye up close: a flower, a sign, a toy, a cake, a piece of street art',
  'the inside of a subway car, a bus or a train from their seat, a little empty',
  'a shelf, a market stall or a menu board full of things, from a step back',
  'the sky or the weather over the street: clouds, rain on the window, snow on cars',
]

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
  if (kind === 'scene') return { kind, setup: SCENE_SETUPS[Math.floor(random() * SCENE_SETUPS.length)] }
  // Two in five photos of the poster are taken from far away (FAR_SELF_SHARE).
  const setups = kind === 'self' && random() < FAR_SELF_SHARE ? FAR_SELF_SETUPS : SETUPS[kind]
  const setup = setups[Math.floor(random() * setups.length)]
  // A mirror selfie gets its own place and framing, so they are not all one tidy room head to toe.
  if (setup === MIRROR_SELF) return { kind, setup: `a mirror selfie ${pickMirrorSelfie(random).text}, the phone held low enough that the face shows` }
  if (setup === MIRROR_FACELESS) return { kind, setup: `a mirror selfie ${pickMirrorSelfie(random).text}, the phone covering the face` }
  return { kind, setup }
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
