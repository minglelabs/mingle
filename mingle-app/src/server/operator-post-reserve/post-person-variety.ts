/**
 * What changes from one photo of the poster to the next (staff 2026-11-23:
 * post photos kept the profile photo's head angle, expression, hairstyle,
 * outfit and light). Telling the image model "a different angle" was not
 * enough: it copied the attached profile photo. Each photo of the poster now
 * names one concrete pick per axis.
 */
type Random = () => number

const pick = <T,>(random: Random, list: readonly T[]): T => list[Math.floor(random() * list.length)]

export const HEAD_ANGLES = [
  'the head turned about three-quarters to the left of the camera',
  'the head turned about three-quarters to the right of the camera',
  'a near side profile, the face turned away to one side',
  'looking down (at a cup, the phone, their hands or the ground), the face tilted down',
  'the chin a little raised, the camera slightly below eye level',
  'looking off to the side at something outside the frame, not at the camera',
  'the head tilted to one side',
  'seen from slightly above, looking up toward the camera',
  'turned partly away, glancing back toward the camera with the shoulders turned too',
] as const

export const EXPRESSIONS = [
  'caught mid-laugh, eyes narrowed and cheeks lifted',
  'a small closed-mouth smile',
  'a neutral, blank everyday face, mouth relaxed',
  'lips pressed together in a playful pout',
  'mid-sentence, the mouth slightly open as if talking to someone off camera',
  'a lazy, sleepy look, eyelids a little heavy',
  'a wide open-mouth grin',
  'concentrating on something, a calm serious face',
  'a mildly surprised look, eyebrows slightly raised',
] as const

export const FEMALE_HAIRSTYLES = [
  'hair tied in a high ponytail',
  'hair in a low loose ponytail',
  'hair up in a messy bun',
  'half-up, half-down hair',
  'hair down, tucked behind one ear',
  'hair twisted up with a claw clip',
  'hair in one loose braid',
  'hair down and a little messy, unbrushed',
  'hair under a baseball cap or beanie',
  'hair down with a hairband or headband',
] as const

export const OUTFITS = [
  'an oversized hoodie or sweatshirt',
  'a fitted knit top or sweater',
  'a plain T-shirt with an open overshirt or jacket',
  'a button-up shirt or blouse',
  'a coat or padded jacket over layers',
  'a dress or skirt outfit',
  'a sleeveless top or camisole with a light cardigan',
  'a sporty outfit (track jacket, leggings or joggers)',
  'jeans and a simple cropped or tucked-in top',
] as const

export const OUTFIT_COLORS = ['black', 'white or cream', 'grey', 'navy', 'beige or brown', 'pastel', 'a muted green', 'a deep red or burgundy', 'denim blue', 'a bold bright color'] as const

export const FACE_LIGHTS = [
  'light from one side, one half of the face a little darker',
  'backlit: the brighter background behind them, the face a bit darker with a soft glow at the hair edge',
  'soft even light, as in open shade or under an overcast sky',
  'warm light from a nearby lamp or shop window on one side',
  'colored light from signs or screens tinting the face slightly',
  'light from above, soft shadows under the brows and chin',
] as const

/**
 * Plain, unremarkable light: what made the most real-looking post photo so far
 * (하은's car selfie, staff 2026-11-23). How it falls depends on the place, so
 * it names the place's own main light rather than a direction.
 */
export const PLAIN_LIGHT = 'plain, unremarkable everyday light: just the place\'s own main light (a window, the ceiling lights, open shade or an overcast sky) falling softly and evenly on the face; low contrast, no noticeable shadows, glow, colored tint or highlights, a little flat like an ordinary phone photo'
export const PLAIN_LIGHT_SHARE = 0.4

/** An unstyled, everyday face (staff 2026-11-23: the photo that looked most real had one). */
export const BARE_FACE = 'Today the face is bare and unstyled: little or no makeup (at most a tinted lip balm), natural brows, bangs or front hair a little out of place with a few loose hairs; an ordinary everyday look, nothing done for the camera.'
export const BARE_FACE_SHARE = 0.4

/**
 * How far the camera is, spread wide on purpose: left alone the model takes
 * nearly every photo from the same chest-up distance (staff, 2026-11-23).
 * The first one only for photos that show the face.
 */
export const CAMERA_DISTANCES = [
  'very close: the face fills most of the frame, the top of the head or the chin cut off by the edge',
  'close, from arm\'s length: head and shoulders',
  'chest up, from about a meter away',
  'waist up, from a couple of meters away',
  'knees up, from a few meters away, a good part of the place around them in frame',
  'full body, head to shoes in frame, from several meters away',
  'from far away: the person small in a wide view of the place, taken from across the street, the room or the park, zoomed in a little so the background looks compressed',
] as const

/** The concrete picks for one photo of the poster, as prompt lines. */
export function pickPersonVariety(random: Random, options: { faces: boolean; female: boolean; hasReference: boolean }): string[] {
  const lines: string[] = []
  const versus = options.hasReference ? ', unlike the attached photo' : ''
  if (options.faces) {
    lines.push(`Head angle in this photo${versus}, unless the description already says: ${pick(random, HEAD_ANGLES)}. Not a straight-on, eye-level head-and-shoulders shot.`)
    lines.push(`Expression in this photo, unless the description already says: ${pick(random, EXPRESSIONS)}.`)
  }
  if (options.female) lines.push(`Hairstyle today${versus}, unless the description already says: ${pick(random, FEMALE_HAIRSTYLES)} (same hair color and length).`)
  lines.push(`Outfit today, unless the description already names one: ${pick(random, OUTFITS)}, mostly ${pick(random, OUTFIT_COLORS)}; no garment or main color${options.hasReference ? ' from the attached photo' : ' repeated from another photo'}.`)
  if (options.faces) {
    const light = random() < PLAIN_LIGHT_SHARE ? PLAIN_LIGHT : pick(random, FACE_LIGHTS)
    lines.push(`Light on the face, within what the place and the description give: ${light}.`)
    if (random() < BARE_FACE_SHARE) lines.push(BARE_FACE)
  }
  const distances = options.faces ? CAMERA_DISTANCES : CAMERA_DISTANCES.slice(1)
  lines.push(`Camera distance, unless the description already fixes it (a mirror selfie, a selfie at arm's length): ${pick(random, distances)}.`)
  return lines
}

/**
 * What the body and hands do. Staff (2026-11-24): real photos are staged in
 * countless ways (a flower held over one eye, a peace sign, peeking from
 * behind a pole) besides caught moments, and the prompt never asked for any,
 * so every photo stood or sat the same way. Each photo picks one, mixing
 * caught moments and poses people choose; `true` marks a chosen pose. Combined
 * with the head angle, expression, hair, outfit, light, distance and the
 * focus and hair picks, no two photos come out the same.
 */
export const FACE_POSES: ReadonlyArray<readonly [string, boolean]> = [
  ['walking toward the camera mid-step, arms loose', false],
  ['looking back over the shoulder while walking away, the shoulders turned too', false],
  ['sitting on a curb or low steps, elbows on the knees', false],
  ['leaning one shoulder against a wall, a pole or a door frame', false],
  ['sitting at a table, chin resting on one hand', false],
  ['holding a cup with both hands in front of the chest', false],
  ['sipping a drink through a straw, eyes up toward the camera', false],
  ['caught mid-bite of food, a little off guard', false],
  ['laughing with one hand over the mouth', false],
  ['pushing the hair back with one hand', false],
  ['tucking the hair behind one ear', false],
  ['both hands in the coat or hoodie pockets', false],
  ['one hand holding the bag strap on the shoulder', false],
  ['arms loosely crossed, relaxed', false],
  ['stretching both arms up', false],
  ['crouching beside something they found (a cat, flowers, a puddle), looking up at the camera', false],
  ['lying on the grass or a bed, the camera above', false],
  ['looking at their own phone with a half smile, not at the camera', false],
  ['shading the eyes from the sun with one hand', false],
  ['sitting hugging their knees', false],
  ['reaching a hand toward the camera as if to grab the phone', false],
  ['an umbrella resting on one shoulder', false],
  ['carrying shopping bags in one hand', false],
  ['the head resting against a window', false],
  ['one hand holding a small thing up beside the face (a flower, a candy, a leaf, a drink), partly covering one eye or a cheek', true],
  ['a peace sign near the face', true],
  ['a small finger heart', true],
  ['the mouth hidden behind a long sleeve, smiling with the eyes', true],
  ['one hand covering one eye', true],
  ['a cheek squished on one palm, a little pout', true],
  ['poking one cheek with a finger', true],
  ['holding a dessert or an ice cream next to the cheek', true],
  ['holding a bouquet up close, half the face behind the flowers', true],
  ['peeking out from behind a pole, a door or a pillar, part of the face hidden', true],
  ['both hands framing the face', true],
  ['a wink or the tongue out', true],
  ['blowing a kiss toward the camera', true],
  ['the head resting on folded arms on a table, looking up', true],
  ['holding the hoodie strings or the coat collar up to the chin', true],
  ['holding a book, a ticket or a menu up, covering the lower half of the face', true],
  ['squatting, arms on the knees, looking up at the camera', true],
  ['arms spread wide as if presenting the place', true],
]

export const BODY_POSES: ReadonlyArray<readonly [string, boolean]> = [
  ['walking, hands in the pockets', false],
  ['one hand on the hip', false],
  ['sitting with the legs crossed', false],
  ['a tote bag on one shoulder, the hand on its strap', false],
  ['leaning on a railing', false],
  ['arms crossed', false],
  ['holding an umbrella', false],
  ['sitting on steps, a bag beside them', false],
  ['leaning against a wall, one foot flat against it', false],
  ['holding a drink up in front of the body', true],
  ['holding a flower or a small thing out toward the camera', true],
  ['in a mirror, the phone in one hand and the other hand in the hair', true],
]

/** Half the photos of the poster keep the background as sharp as the person. */
export const DEEP_FOCUS_SHARE = 0.5
/** About a third let the hair fall across part of the face. */
export const LOOSE_HAIR_SHARE = 0.3

export type PoseVariety = { line: string; posed: boolean; deepFocus: boolean; looseHair: boolean }

/** The pose, and the focus and hair picks that go with a photo of the poster. */
export function pickPoseVariety(random: Random, options: { faces: boolean }): PoseVariety {
  const [pose, posed] = pick(random, options.faces ? FACE_POSES : BODY_POSES)
  const deepFocus = random() < DEEP_FOCUS_SHARE
  const looseHair = options.faces && random() < LOOSE_HAIR_SHARE
  return { line: `Pose and hands in this photo, unless the description already says: ${pose}.`, posed, deepFocus, looseHair }
}
