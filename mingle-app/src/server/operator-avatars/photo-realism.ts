/**
 * What keeps a generated photo from looking generated, worked out by
 * comparing drafts against real phone photos (2026-10, see
 * docs/operator-content-reference.md). Image models drift to one look: a face
 * lit more brightly than the place it is in, eyes staring into the lens, hair
 * arranged strand by strand, a retouched face, glossy surfaces, and a scene
 * whose every color matches. Words like "realistic", "casual" or "aesthetic"
 * do not help. What helps is describing how a phone photo really comes out.
 *
 * Lessons that shaped the wording:
 * - Light the face only by the place: in shade with a bright sky behind, the
 *   face is a little dull and the sky blows out. Naming a flash at all, even
 *   to forbid it, pulls the picture toward a flash look, so it is never named.
 * - Too many strong instructions at once (light direction, lens distortion,
 *   heavy noise) made the picture look staged; each line stays mild.
 * - Pretty faces are fine and realistic; the face itself is not made plainer.
 * - An outfit is coordinated (people dress with care); the mismatched colors
 *   belong in the background.
 * - Selfie takers frame carefully: no forced finger in the frame.
 */
type Random = () => number
export type PhotoEnvironment = 'indoor' | 'outdoor' | 'any'

const CAMERA = [
  'Straight out of the phone\'s default camera app: no portrait mode, no beauty app, no face slimming, no eye enlarging, no skin smoothing, no added blush or glow. The background is as sharp as the subject, no artificial bokeh.',
  'Phone-camera rendering: slightly over-sharpened edges, small-sensor noise in the shadows, auto white balance a bit off (slightly too warm or too cool).',
]

const LIGHT = [
  'Light: only what the place itself gives, with its natural falloff (the sky, a window, ceiling lights or street lamps); soft shadows under the chin, nose and furniture; mixed color temperatures where different lights meet; whites that are slightly grey or slightly warm, not pure.',
  'Any face is lit like its surroundings and no more brightly: no extra light falling on the face.',
  'Colors are muted and true to life, like an uncorrected phone photo: no boosted saturation, no HDR halo, no color grade, no glow, no rim light, no dramatic shadows.',
]

const TEXTURE = 'Every surface has its real texture and only the shine it really has: matte walls, fabric with visible weave or knit ribs and pilling, faded denim, scuffed leather, smudged glass, worn wood, dull metal. Nothing looks waxed, glossy, plastic or rendered.'

/** Everyday objects whose colors clash with the scene; they are what a styled picture leaves out. */
const CLASHING_COLORS: Record<PhotoEnvironment, string> = {
  outdoor: 'a bright green or neon shop sign, a blue plastic trash bin, a red fire extinguisher box on a wall, an orange traffic cone, a parked scooter',
  indoor: 'a bright plastic water bottle, a colored charger cable, a red or yellow takeaway bag, a green plant pot, a sticky note on the wall',
  any: 'a bright plastic bottle, a colored sign, a blue bin, a red or orange object off to one side',
}

const SKIN = 'Skin: real, matte skin with visible pores, fine texture and slight unevenness in tone, a little natural shine only on the forehead or nose, makeup that sits on the skin rather than looking airbrushed. No smooth, porcelain, waxy or glossy skin.'

/** For a striking face: heavy pores and dullness made the same face score far lower. */
const CLEAR_SKIN = 'Skin: clear, healthy skin with fine natural texture and a soft natural sheen, makeup that sits on the skin, not airbrushed or plastic.'

const PEOPLE = 'Clothes crease and hang naturally; the expression is relaxed and caught mid-moment, not a posed photo smile.'

const HAIR: Record<PhotoEnvironment, string> = {
  outdoor: 'Hair: a light breeze, so a few strands are out of place: one or two loose strands across the face, the bangs (if any) slightly split, a few flyaways on top. The hairstyle keeps its shape.',
  indoor: 'Hair: not arranged for the photo: a few flyaways on top, a loose strand or two, slightly uneven ends. The hairstyle keeps its shape.',
  any: 'Hair: not arranged for the photo: a few loose strands and flyaways. The hairstyle keeps its shape.',
}

const FLAWS = [
  'the frame is tilted a few degrees',
  'the subject sits off-center',
  'something in the foreground (a cup, a railing, a sign edge) intrudes slightly',
  'slight motion blur on one moving part',
  'a little haze from a smudged phone lens',
  'too much empty floor, wall or sky above or below the subject',
  'the brightest part (sky, window or lamp) is overexposed while the rest is a bit dark',
  'the focus landed a little off',
]

const AVOID = 'Keep any face proportions exactly as described; do not average them toward a typical face. Avoid everything that marks an AI, stock or retouched image: an averaged beauty face with big round eyes, a tiny pointed nose and a V-line chin, a face lit more brightly than its surroundings, a retouched or beauty-filtered face, perfectly arranged hair, an overall plastic sheen, glossy or airbrushed skin, oversaturated colors, shallow depth of field, a magazine or advertising look.'

/** `count` different flaws for one photo. */
function pickFlaws(random: Random, count: number): string[] {
  const pool = [...FLAWS]
  const picked: string[] = []
  while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  return picked
}

/**
 * The realism block appended to every operator photo prompt. `people` adds
 * skin, hair and expression; `environment` picks the hair and background
 * lines that fit the place.
 */
export function phonePhotoRealism(
  random: Random = Math.random,
  options: { people?: boolean; environment?: PhotoEnvironment; clearSkin?: boolean } = {},
): string {
  const environment = options.environment ?? 'any'
  const people = options.people !== false
  return [
    ...CAMERA,
    ...LIGHT,
    TEXTURE,
    `The background has a few everyday colors that do not match the scene, such as ${CLASHING_COLORS[environment]}.`,
    ...(people ? [options.clearSkin ? CLEAR_SKIN : SKIN, HAIR[environment], PEOPLE] : []),
    // People taking their own photo frame it with some care, so fewer flaws there.
    `Imperfections in this photo: ${pickFlaws(random, people ? 2 : 3).join('; ')}.`,
    AVOID,
  ].join('\n')
}
