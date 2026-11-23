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

/** The concrete picks for one photo of the poster, as prompt lines. */
export function pickPersonVariety(random: Random, options: { faces: boolean; female: boolean; hasReference: boolean }): string[] {
  const lines: string[] = []
  const versus = options.hasReference ? ', unlike the attached photo' : ''
  if (options.faces) {
    lines.push(`Head angle in this photo${versus}: ${pick(random, HEAD_ANGLES)}. Not a straight-on, eye-level head-and-shoulders shot.`)
    lines.push(`Expression in this photo: ${pick(random, EXPRESSIONS)}.`)
  }
  if (options.female) lines.push(`Hairstyle today${versus}: ${pick(random, FEMALE_HAIRSTYLES)} (same hair color and length).`)
  lines.push(`Outfit today, unless the description already names one: ${pick(random, OUTFITS)}, mostly ${pick(random, OUTFIT_COLORS)}; no garment or main color${options.hasReference ? ' from the attached photo' : ' repeated from another photo'}.`)
  if (options.faces) lines.push(`Light on the face, within what the place gives: ${pick(random, FACE_LIGHTS)}.`)
  return lines
}
