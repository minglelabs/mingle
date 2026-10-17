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
 * - Ten real faces the founder scores 100 each differ from the AI beauty in
 *   at least one place, and mostly in the same few: soft youthful fullness in
 *   the cheeks over a small, narrow jaw instead of hollow model cheeks; a
 *   short, rounded chin instead of a long V; a small, low or short nose
 *   instead of a high, thin, pointed one; a small but full mouth; eyes that
 *   are horizontally long, heavy-lidded, slightly downturned or wide-set
 *   instead of big round double-lidded ones; a short midface. Fullness only
 *   hurt when it came with a broad jaw or a wide mouth.
 * - Two outlines that real untypical beauties have and the model never draws
 *   unasked: a soft round outline whose fullness sits only mid-cheek and ends
 *   in a slim short chin (fullness along the jaw is what made faces chubby),
 *   and a lean face with prominent front cheekbones instead of an egg oval.
 * - "A small face", a high forehead and a small chin, with the hair pulled
 *   back and no bangs, drew an oversized skull above the forehead. The face
 *   is never called small, the head is said to be in proportion, and a high
 *   forehead gets bangs or face-framing hair (see `foreheadFringe`).
 *
 * - Spelling out every feature (and adding "do not …" lists) lowered the
 *   score every time; the model's own face is pretty, and the best drafts
 *   named only two or three traits. So only the traits that break the
 *   typical face are named; the axes' common options are kept as the middle
 *   those traits are picked against.
 * - The model exaggerates whatever is named: "noticeably wide-set eyes" and
 *   "a full upper lip" came out as staring eyes and filler lips. Distinctive
 *   traits are worded mildly ("slightly", "a little"), and the line says the
 *   face is only subtly unlike a typical one.
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
    ['soft_round_slim_chin', 1.5, 'a soft, rounded outline widest across the middle of the cheeks, curving smoothly with no corners to a slim, short chin, with soft flesh on the cheeks but none along the jaw', 'distinctive'],
    ['lean_front_cheekbones', 1.5, 'a lean face whose bone structure shows, not a smooth egg-shaped oval: prominent front cheekbones that catch the light with a slight hollow below them, and a jaw that is neither angular nor V-shaped', 'distinctive'],
    ['high_forehead', 1.2, 'a high, wide forehead over a short lower face', 'distinctive'],
    ['long', 1, 'a long face', 'plain'],
    ['round_broad', 1, 'a broad, round face', 'plain'],
    ['wide_jaw', 0.8, 'a wide, square jaw', 'plain'],
  ]],
  ['flesh', [
    ['lean', 3, 'lean flesh and a clean jawline, any width coming from bone, not fullness', 'common'],
    ['youthful', 3, 'soft, youthful fullness in the cheeks over a small, narrow bone structure, the jaw staying narrow and smooth', 'common'],
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
    ['high_hollow', 1.3, 'slightly high cheekbones', 'distinctive'],
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
    ['hidden', 1.5, 'a heavy upper lid with a hidden crease that shows only toward the outer corners', 'distinctive'],
    ['puffy', 0.8, 'heavy, puffy monolids', 'plain'],
  ]],
  ['eyeShape', [
    ['almond', 3, 'almond eyes of medium size', 'common'],
    ['long_narrow', 1.5, 'slightly long, narrow eyes', 'distinctive'],
    ['downturned', 1.5, 'slightly downturned, soft eyes', 'distinctive'],
    ['lifted', 1.5, 'eyes whose outer corners lift slightly', 'distinctive'],
    ['small', 0.8, 'small, narrow eyes', 'plain'],
  ]],
  ['eyeSpacing', [
    ['average', 4, '', 'common'],
    ['wide', 1.5, 'eyes set a little wider apart than usual', 'distinctive'],
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
    ['low_thick', 1.2, 'slightly low, straight brows', 'distinctive'],
    ['high_light', 1, 'light, thin brows set high above the eyes', 'distinctive'],
    ['sparse', 0.6, 'sparse, uneven brows', 'plain'],
  ]],
  ['noseBridge', [
    ['medium', 3, 'a straight nose bridge of medium height', 'common'],
    ['high', 1.2, 'a slightly higher nose bridge', 'distinctive'],
    ['bump', 1, 'a very small bump on the nose bridge', 'distinctive'],
    ['low_soft', 2, 'a low, soft nose bridge', 'distinctive'],
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
    ['upper_full', 1.2, 'an upper lip a little fuller than usual', 'distinctive'],
    ['thin_upper', 1, 'a thin upper lip over a fuller lower lip', 'distinctive'],
    ['plump', 1, 'lips that pout very slightly at rest', 'distinctive'],
    ['thin', 0.8, 'thin lips', 'plain'],
  ]],
  ['mouthWidth', [
    ['average', 4, '', 'common'],
    ['wide', 1.3, 'a wide mouth for the face', 'distinctive'],
    ['small', 2, 'a small but full mouth', 'distinctive'],
  ]],
  ['lipLine', [
    ['soft_bow', 3, 'a soft cupid\'s bow', 'common'],
    ['sharp_bow', 1.2, 'a slightly defined cupid\'s bow', 'distinctive'],
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

/**
 * Distinctive traits that pulled a striking face down when scored: a broad
 * short face and a wide mouth (a short midface and full cheeks were fine
 * once the jaw and mouth stayed small, as the reference faces show), a
 * longer midface that broke the harmony, and a bony face that read as
 * masculine. They stay for ordinary and pleasant faces only.
 */
const NOT_FOR_STRIKING: Readonly<Record<string, readonly string[]>> = {
  midface: ['slightly_long'],
  mouthWidth: ['wide'],
  // A heavy upper lid and a short rounded chin drew the same plain, round face twice (50).
  eyeCrease: ['hidden'],
  lowerFace: ['short', 'soft_weak'],
  // A bony face with prominent front cheekbones read as masculine (scored 50).
  faceShape: ['short_cheekbone', 'lean_front_cheekbones'],
}

/** How many distinctive and plain traits each grade gets. */
const GRADE_MIX: Record<FaceGrade, { distinctive: readonly [min: number, max: number]; plain: readonly [min: number, max: number] }> = {
  // Striking faces are asked for in the abstract; one mild trait eases the typical look without costing beauty.
  striking: { distinctive: [1, 1], plain: [0, 0] },
  pleasant: { distinctive: [1, 2], plain: [0, 1] },
  ordinary: { distinctive: [0, 1], plain: [1, 2] },
}

function between(random: Random, [min, max]: readonly [number, number]): number {
  return min + Math.floor(random() * (max - min + 1))
}

function takeOne(random: Random, pool: number[]): number {
  return pool.splice(Math.floor(random() * pool.length), 1)[0]
}

/**
 * "face, unlike a typical pretty face: …" naming only the one to three
 * traits that break the typical face. The model's own default face is
 * already pretty; spelling out every feature, or adding "do not …" lists,
 * broke its harmony and scored lower every time (the best drafts named
 * two or three things), so the other features are left to it.
 */
export function describeFace(take: Picker, random: Random, grade: FaceGrade): string {
  const mix = GRADE_MIX[grade]
  const kinds = new Map<number, Kind>()
  const usable = (axis: string, feature: Feature) => !(grade === 'striking' && NOT_FOR_STRIKING[axis]?.includes(feature[0]))
  const withKind = (kind: Kind) =>
    FACE_AXES.map((_, index) => index).filter((index) => !kinds.has(index) && FACE_AXES[index][1].some((feature) => feature[3] === kind && usable(FACE_AXES[index][0], feature)))
  for (const kind of ['distinctive', 'plain'] as const) {
    const pool = withKind(kind)
    for (let count = between(random, mix[kind]); count > 0 && pool.length; count -= 1) kinds.set(takeOne(random, pool), kind)
  }

  const traits: string[] = []
  let highForehead = false
  FACE_AXES.forEach(([axis, features], index) => {
    const kind = kinds.get(index)
    if (!kind) return
    const options = features.filter((feature) => feature[3] === kind && usable(axis, feature))
    const text = take(axis, options.map(([key, weight, label]) => [key, weight, label] as const))
    const key = options.find((feature) => feature[2] === text)?.[0] ?? ''
    if (HIGH_FOREHEADS.has(key)) highForehead = true
    if (text) traits.push(text)
  })
  if (!traits.length) return ''
  // A high forehead made the model draw an oversized skull above it.
  return `face, subtly unlike a typical pretty face: ${traits.join('; ')}${highForehead ? '; the head in natural proportion to the face' : ''}`
}

/** Forehead traits that need hair over or around the forehead to keep the head in proportion. */
const HIGH_FOREHEADS = new Set(['high_forehead', 'high_round', 'broad'])

/** The fringe options a face can take: a high forehead with nothing over it looks like an oversized head. */
export function foreheadFringe(attributes: Record<string, string>): readonly Option[] {
  const high = HIGH_FOREHEADS.has(attributes.faceShape) || HIGH_FOREHEADS.has(attributes.forehead)
  return high ? FRINGE.filter((option) => option[0] !== 'none') : FRINGE
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

/**
 * Real-face details the founder picked out (2026-10): each one, only just
 * visible, makes a beautiful face read as a real person's instead of the
 * typical AI face, without costing beauty. Grouped by area so one face never
 * gets two contradicting details (wide-set and close-set eyes). Every text
 * says "very slightly": the model exaggerates anything named plainly.
 */
const SUBTLE_TRAITS: ReadonlyArray<readonly [area: string, options: readonly Option[]]> = [
  ['eyeSpacing', [['wide', 1, 'eyes set very slightly wide apart'], ['close', 0.7, 'eyes set very slightly close together']]],
  ['eyeCorners', [['short_corners', 1, 'very slightly short inner and outer eye corners, not elongated']]],
  ['eyelid', [['monolid', 1, 'monolids']]],
  ['midface', [['long', 0.8, 'a very slightly long midface'], ['short', 0.8, 'a very slightly short midface']]],
  ['lips', [['natural_lips', 1, 'natural, unfilled lips, not plump'], ['small_mouth', 1, 'a very slightly small mouth']]],
  ['noseBridge', [['low_root', 1, 'a nose bridge that stays low between the eyes even though the tip is high']]],
  ['noseTip', [['pointed_tip', 0.8, 'a very slightly pointed nose tip'], ['round_tip', 0.8, 'a softly round nose tip']]],
  ['faceShape', [['round', 1, 'a very slightly round face rather than an egg-shaped oval'], ['long', 0.8, 'a face very slightly longer than an egg-shaped oval']]],
  ['cheeks', [['lean_cheeks', 0.6, 'very slightly lean cheeks'], ['cheekbones', 0.8, 'very slightly prominent front and side cheekbones']]],
  ['philtrum', [['long', 0.7, 'a very slightly long philtrum'], ['short', 0.7, 'a very slightly short philtrum']]],
  ['chin', [['weak', 0.8, 'a very slightly weak, small chin'], ['strong', 0.6, 'a chin very slightly strong for a woman']]],
  ['forehead', [['broad_flat', 0.7, 'a very slightly broad, flat forehead'], ['wide', 0.7, 'a very slightly wide forehead'], ['narrow', 0.6, 'a very slightly narrow forehead']]],
  ['hair', [['thin_hair', 0.6, 'hair very slightly thin in volume']]],
  ['smileLines', [['nasolabial', 0.6, 'the faintest smile lines beside the nose']]],
  ['dimples', [['dimples', 0.7, 'small dimples']]],
  // Added beyond the founder's list, in the same spirit.
  ['eyeShape', [['downturned', 0.8, 'outer eye corners turned very slightly down'], ['small_eyes', 0.6, 'eyes very slightly small for the face'], ['inner_fold', 0.8, 'a thin inner-fold crease that hides near the inner corner']]],
  ['noseShape', [['wide_nostrils', 0.6, 'nostrils very slightly wide'], ['short_nose', 0.7, 'a very slightly short nose'], ['bump', 0.5, 'a tiny bump on the nose bridge']]],
  ['lipShape', [['thin_upper', 0.7, 'a very slightly thin upper lip'], ['soft_line', 0.7, 'a soft lip line, not sharply drawn'], ['corners_down', 0.5, 'mouth corners very slightly turned down at rest']]],
  ['brows', [['uneven_brows', 0.7, 'brows very slightly uneven'], ['sparse_tail', 0.6, 'brows a little sparse toward the tail'], ['low_brows', 0.6, 'brows sitting very slightly low over the eyes']]],
  ['ears', [['ears_out', 0.5, 'ears that stick out very slightly']]],
  ['skinMarks', [['freckles', 0.6, 'a few faint freckles'], ['moles', 0.7, 'two or three small moles on the face']]],
  ['jaw', [['jaw_corners', 0.6, 'jaw corners faintly visible']]],
  ['hairline', [['uneven_hairline', 0.6, 'a slightly uneven hairline with baby hairs']]],
]

/**
 * How often each area is picked. Bone structure (face shape, cheekbones,
 * forehead, chin, midface) made faces clearly less typical; details that
 * match the model's own cute beauty (a round face, dimples, wide-set eyes
 * with a bubbly look) were absorbed and changed nothing (2026-10).
 */
const AREA_WEIGHTS: Readonly<Record<string, number>> = {
  faceShape: 2, cheeks: 1.8, forehead: 1.5, chin: 1.5, midface: 1.5, jaw: 1.3, lips: 1.3, noseBridge: 1.3,
  dimples: 0.4,
}

/** Options that match the model's default cute face; picked less often. */
const CUTE_DEFAULTS = new Set(['faceShape:round', 'eyeSpacing:wide'])

/**
 * Three or four subtle details from different areas, kept as subtle_<area>
 * in the attributes. Forcing one onto the eyes, nose or mouth felt rigid;
 * with this many picks from the whole list they land there often anyway.
 */
export function subtleTraits(take: Picker, random: Random, gender: 'female' | 'male'): string {
  const areas = SUBTLE_TRAITS.filter(([area]) => !(gender === 'male' && area === 'chin'))
  const pool = areas.map((_, index) => index)
  const picked: string[] = []
  for (let left = random() < 0.5 ? 3 : 4; left > 0 && pool.length; left -= 1) {
    // Weighted by area: bone structure moved the face most, cute details the least.
    const total = pool.reduce((sum, index) => sum + (AREA_WEIGHTS[areas[index][0]] ?? 1), 0)
    let roll = random() * total
    const at = pool.findIndex((index) => (roll -= AREA_WEIGHTS[areas[index][0]] ?? 1) < 0)
    const [area, options] = areas[pool.splice(at < 0 ? pool.length - 1 : at, 1)[0]]
    picked.push(take(`subtle_${area}`, options.map(([key, weight, text]) => [key, weight * (CUTE_DEFAULTS.has(`${area}:${key}`) ? 0.4 : 1), text] as const)))
  }
  return `very subtle details of a real face, each only just visible: ${picked.join('; ')}`
}
