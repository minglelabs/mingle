/**
 * Faces described feature by feature, the way an aesthetic-surgery consult
 * would: bone outline, flesh, forehead, cheekbones, lower face, eyes (crease,
 * shape, spacing), brows, nose (bridge, tip, length), lips (fullness, width,
 * line) and the distances between them.
 *
 * What drafting showed (2026-10, scored by the founder against real photos):
 * - Asked for a pretty face, the image model draws one averaged face. Pretty
 *   words alone, or features alone, do not move it.
 * - Bending many traits at once makes a plain face, not an interesting one;
 *   six off-ideal traits scored well below the averaged face.
 * - What reads as a real, memorable beauty is two or three distinctive traits
 *   on an otherwise pretty face, and the distinctiveness is often in how
 *   features sit together (wide-set eyes under a high forehead, downturned eyes
 *   over a short lower face) more than in any one feature.
 * - "Wide face" is drawn as a chubby face unless the flesh is called lean: the
 *   width has to come from bone.
 * - A long face drawn on purpose looks too long; it stays out of pretty faces.
 *
 * Every option is one of three kinds: `common` (the pretty middle),
 * `distinctive` (off the ideal yet attractive) and `plain` (off the ideal in a
 * way that makes the face more ordinary). The attractiveness grade decides how
 * many of each a face gets.
 */
type Random = () => number
type Option = readonly [key: string, weight: number, text: string]
type Picker = (axis: string, options: readonly Option[]) => string

type Kind = 'common' | 'distinctive' | 'plain'
type Feature = readonly [key: string, weight: number, text: string, kind: Kind]

export type FaceGrade = 'ordinary' | 'pleasant' | 'striking'

/** Axes in the order they read in the prompt. An empty text means "nothing to mention". */
const FACE_AXES: ReadonlyArray<readonly [axis: string, features: readonly Feature[]]> = [
  ['faceShape', [
    ['oval', 3, 'an oval face with a softly rounded jaw', 'common'],
    ['soft_heart', 2, 'a soft heart-shaped face, a little wider at the temples, narrowing to a rounded chin', 'common'],
    ['short_cheekbone', 1.5, 'a short face whose widest part is broad, high cheekbones', 'distinctive'],
    ['soft_square', 1.2, 'a softly square face, the jaw corners faintly visible on each side', 'distinctive'],
    ['diamond', 1, 'a diamond-shaped face: a narrower forehead and chin, widest at the cheekbones', 'distinctive'],
    ['small_high_forehead', 1.2, 'a small face with a high, wide forehead and a short lower face', 'distinctive'],
    ['long', 1, 'a long face', 'plain'],
    ['round_broad', 1, 'a broad, round face', 'plain'],
    ['wide_jaw', 0.8, 'a wide, square jaw', 'plain'],
  ]],
  ['flesh', [
    ['lean', 3, 'lean flesh and a clean jawline, any width coming from bone, not fullness', 'common'],
    ['soft', 2, 'soft cheeks over a still visible jawline', 'common'],
    ['full', 1, 'full, round cheeks that soften the jawline', 'plain'],
  ]],
  ['forehead', [
    ['average', 4, '', 'common'],
    ['high_round', 1.2, 'a high, rounded forehead', 'distinctive'],
    ['broad', 1, 'a broad forehead', 'distinctive'],
    ['low', 0.8, 'a low, narrow forehead', 'plain'],
  ]],
  ['cheekbones', [
    ['average', 4, '', 'common'],
    ['high_hollow', 1.3, 'high, prominent cheekbones with a slight hollow below them', 'distinctive'],
    ['apple', 1.2, 'full, rounded front cheeks that lift when smiling', 'distinctive'],
    ['flat', 0.8, 'flat cheekbones', 'plain'],
  ]],
  ['lowerFace', [
    ['small_round', 3, 'a small, softly rounded chin', 'common'],
    ['short', 1.3, 'a short lower face with a small chin', 'distinctive'],
    ['forward_chin', 1, 'a straight chin that projects slightly forward', 'distinctive'],
    ['soft_weak', 1, 'a soft, slightly receding chin and a short jaw', 'distinctive'],
    ['long_heavy', 0.8, 'a long lower face with a heavy chin', 'plain'],
  ]],
  ['midface', [
    ['average', 4, '', 'common'],
    ['short', 1.3, 'a short midface, the mouth close under the nose', 'distinctive'],
    ['slightly_long', 1, 'a slightly long midface, a calm distance between the eyes and the mouth', 'distinctive'],
    ['long', 0.8, 'a long midface', 'plain'],
  ]],
  ['eyeCrease', [
    ['inner_fold', 3, 'a thin inner double-eyelid crease that starts inside the inner corner', 'common'],
    ['parallel', 2, 'clear parallel double eyelids', 'common'],
    ['monolid', 1.5, 'monolids', 'distinctive'],
    ['hidden', 1.2, 'a hidden crease that shows only toward the outer corners', 'distinctive'],
    ['puffy', 0.8, 'heavy, puffy monolids', 'plain'],
  ]],
  ['eyeShape', [
    ['almond', 3, 'almond eyes of medium size', 'common'],
    ['long_narrow', 1.5, 'long, narrow eyes', 'distinctive'],
    ['downturned', 1.5, 'slightly downturned, soft eyes', 'distinctive'],
    ['lifted', 1.5, 'eyes with lifted outer corners', 'distinctive'],
    ['small', 0.8, 'small, narrow eyes', 'plain'],
  ]],
  ['eyeSpacing', [
    ['average', 4, '', 'common'],
    ['wide', 1.5, 'eyes set noticeably wide apart', 'distinctive'],
    ['close', 0.7, 'eyes set a little close together', 'distinctive'],
  ]],
  ['eyeDetail', [
    ['average', 4, '', 'common'],
    ['aegyo_sal', 1.3, 'soft fullness right under the eyes', 'distinctive'],
    ['deep_set', 1, 'slightly deep-set eyes', 'distinctive'],
    ['dark_circles', 0.8, 'dark under-eye circles', 'plain'],
  ]],
  ['brows', [
    ['straight', 3, 'straight, natural brows', 'common'],
    ['soft_arch', 2, 'softly arched brows', 'common'],
    ['low_thick', 1.2, 'thick, straight brows set low, close above the eyes', 'distinctive'],
    ['high_light', 1, 'light, thin brows set high above the eyes', 'distinctive'],
    ['sparse', 0.6, 'sparse, uneven brows', 'plain'],
  ]],
  ['noseBridge', [
    ['medium', 3, 'a straight nose bridge of medium height', 'common'],
    ['high', 1.2, 'a high, straight nose bridge', 'distinctive'],
    ['bump', 1, 'a nose bridge with a small bump', 'distinctive'],
    ['low_soft', 1.2, 'a low, soft nose bridge', 'distinctive'],
    ['flat_wide', 0.8, 'a flat, wide nose bridge', 'plain'],
  ]],
  ['noseTip', [
    ['neat_round', 3, 'a small, neat, rounded nose tip', 'common'],
    ['upturned', 1.2, 'a slightly upturned nose tip', 'distinctive'],
    ['down_defined', 1, 'a defined nose tip that points slightly down', 'distinctive'],
    ['button', 1, 'a soft, round button tip', 'distinctive'],
    ['bulbous', 0.8, 'a wide, bulbous nose tip with flared nostrils', 'plain'],
  ]],
  ['noseLength', [
    ['average', 4, '', 'common'],
    ['short', 1.2, 'a short nose', 'distinctive'],
    ['long', 1, 'a long nose', 'distinctive'],
    ['large', 0.7, 'a large nose', 'plain'],
  ]],
  ['lipFullness', [
    ['lower_fuller', 3, 'full lips, the lower one a little fuller', 'common'],
    ['upper_full', 1.2, 'a full upper lip, as full as the lower one', 'distinctive'],
    ['thin_upper', 1, 'a thin upper lip over a fuller lower lip', 'distinctive'],
    ['plump', 1, 'plump, slightly pouting lips', 'distinctive'],
    ['thin', 0.8, 'thin lips', 'plain'],
  ]],
  ['mouthWidth', [
    ['average', 4, '', 'common'],
    ['wide', 1.3, 'a wide mouth for the face', 'distinctive'],
    ['small', 1, 'a small mouth', 'distinctive'],
  ]],
  ['lipLine', [
    ['soft_bow', 3, 'a soft cupid\'s bow', 'common'],
    ['sharp_bow', 1.2, 'a sharp, clearly drawn cupid\'s bow', 'distinctive'],
    ['m_shape', 1, 'an M-shaped upper lip', 'distinctive'],
    ['corners_up', 1.2, 'mouth corners that turn up at rest', 'distinctive'],
    ['corners_down', 0.8, 'mouth corners that turn down slightly at rest', 'distinctive'],
  ]],
  ['philtrum', [
    ['average', 4, '', 'common'],
    ['short', 1.2, 'a short philtrum', 'distinctive'],
    ['long', 0.8, 'a long philtrum', 'plain'],
  ]],
]

/** Axes kept fixed for a pretty face: a full, round face or a long one stops reading as pretty. */
const PRETTY_FIXED: Readonly<Record<string, readonly string[]>> = {
  flesh: ['lean'],
}

/**
 * Distinctive traits that still pulled a striking face down to a cute, round
 * one when scored (a short compact face, a short midface, full lifting
 * cheeks, a wide mouth); they stay for ordinary and pleasant faces only.
 */
const NOT_FOR_STRIKING: Readonly<Record<string, readonly string[]>> = {
  faceShape: ['short_cheekbone'],
  cheekbones: ['apple'],
  lowerFace: ['short'],
  midface: ['short'],
  mouthWidth: ['wide'],
}

/** How many distinctive and plain traits each grade gets. */
const GRADE_MIX: Record<FaceGrade, { distinctive: readonly [min: number, max: number]; plain: readonly [min: number, max: number] }> = {
  striking: { distinctive: [2, 3], plain: [0, 0] },
  pleasant: { distinctive: [2, 3], plain: [0, 1] },
  ordinary: { distinctive: [1, 2], plain: [2, 3] },
}

function between(random: Random, [min, max]: readonly [number, number]): number {
  return min + Math.floor(random() * (max - min + 1))
}

function takeOne(random: Random, pool: number[]): number {
  return pool.splice(Math.floor(random() * pool.length), 1)[0]
}

/**
 * "face: …; the most noticeable traits, kept exactly as described: …".
 * Picks which axes carry the distinctive and plain traits, then takes every
 * axis from the kind it was given; the rest stay in the pretty middle.
 */
export function describeFace(take: Picker, random: Random, grade: FaceGrade): string {
  const mix = GRADE_MIX[grade]
  const kinds = new Map<number, Kind>()
  const usable = (axis: string, feature: Feature) => !(grade === 'striking' && NOT_FOR_STRIKING[axis]?.includes(feature[0]))
  const withKind = (kind: Kind) =>
    FACE_AXES.map((_, index) => index).filter((index) => !kinds.has(index) && FACE_AXES[index][1].some((feature) => feature[3] === kind && usable(FACE_AXES[index][0], feature)) && !(grade !== 'ordinary' && FACE_AXES[index][0] in PRETTY_FIXED))
  for (const kind of ['distinctive', 'plain'] as const) {
    const pool = withKind(kind)
    for (let count = between(random, mix[kind]); count > 0 && pool.length; count -= 1) kinds.set(takeOne(random, pool), kind)
  }

  const lines: string[] = []
  const signature: string[] = []
  FACE_AXES.forEach(([axis, features], index) => {
    const kind = kinds.get(index) ?? 'common'
    const fixed = grade !== 'ordinary' ? PRETTY_FIXED[axis] : undefined
    const excluded = grade === 'striking' ? NOT_FOR_STRIKING[axis] ?? [] : []
    const options = features.filter((feature) => (fixed ? fixed.includes(feature[0]) : feature[3] === kind) && !excluded.includes(feature[0])).map(([key, weight, text]) => [key, weight, text] as const)
    const text = take(axis, options)
    if (!text) return
    lines.push(text)
    if (kind === 'distinctive') signature.push(text)
  })
  const kept = signature.length ? `; the most noticeable traits, kept exactly as described: ${signature.join('; ')}` : ''
  return `face: ${lines.join('; ')}${kept}`
}

/** Fringe and hairline: they change how the forehead and the whole face read. */
export const FRINGE: readonly Option[] = [
  ['none', 3, 'no bangs, the forehead showing'], ['see_through', 3, 'thin see-through bangs'], ['curtain', 2.5, 'curtain bangs parted in the middle'],
  ['wispy', 2, 'a few wispy face-framing strands instead of bangs'], ['blunt', 1.3, 'full, blunt bangs to the brows'], ['side_swept', 1.3, 'long side-swept bangs'],
]

export const HAIRLINE: readonly Option[] = [
  ['straight', 3, 'a straight hairline'], ['rounded', 2.5, 'a rounded hairline with fine baby hairs'],
  ['widows_peak', 1, 'a small widow\'s peak'], ['m_shape', 1, 'a hairline slightly receding at the temples'],
]
