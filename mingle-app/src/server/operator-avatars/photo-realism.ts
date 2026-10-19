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
  'Straight out of the phone\'s default camera app: no portrait mode, no beauty app, no face slimming, no eye enlarging, no skin smoothing, no added blush or glow. The background is a little softer than the subject, the way a phone\'s main camera renders things further away, never an artificial portrait blur.',
  // Real photos are less crisp than renders; the staff-approved café shot
  // (2026-10) came from asking for a soft, compressed, shared-online look.
  // Asking for sensor noise, pores and fabric pilling piled up into a gritty,
  // crawling micro-texture over skin and every surface, the giveaway of a
  // generated photo (2026-10); tones stay smooth and clean instead.
  'Phone-camera rendering, less crisp than a render: a little soft overall and slightly low resolution, like a photo shared on Instagram; smooth, clean tonal gradations on skin, walls and sky, with no grain, no noise speckle and no gritty, crawling micro-texture anywhere; auto white balance a bit off (slightly too warm or too cool).',
]

/**
 * Which phone camera took it. A focal length tells the model how far the
 * camera stood and how the perspective falls; the portrait lens of a real
 * camera (85mm) does not fit a phone photo.
 */
export type PhoneLens = 'front' | 'main' | 'zoom'
const LENS: Record<PhoneLens, string> = {
  front: 'Lens: the phone\'s front camera (about 24mm wide) at arm\'s length: a slight wide-angle perspective, the face a little larger than the shoulders.',
  main: 'Lens: the phone\'s main camera (about 26mm wide): a natural wide view with the surroundings in frame.',
  zoom: 'Lens: the phone\'s 2x camera (about 50mm), taken from a few steps away: a normal, undistorted perspective.',
}

/** The lens a described shot was taken with: a selfie is the front camera, someone photographing a person is usually the 2x. */
export function lensForShot(description: string): PhoneLens {
  if (/mirror/i.test(description)) return 'main'
  if (/selfie|front[- ]camera/i.test(description)) return 'front'
  // Across a table the friend is within arm's reach: the main camera, not the zoom.
  if (/across (a|the) [^.]{0,40}table/i.test(description)) return 'main'
  if (/\b(friend|someone|stranger)\b[^.]{0,40}\b(took|snapped|shot|photographed)\b/i.test(description)) return 'zoom'
  return 'main'
}

/**
 * For photos where the person is the point (posts of the poster): a real lens
 * focuses on one distance, so the person is sharp and what is far behind
 * them goes soft, and the skin is simply clean; the ordinary look comes from
 * the camera, not from blemishes.
 */
const CAMERA_FOCUSED = 'Straight out of the phone\'s main camera: no portrait mode, no beauty app, no face slimming, no eye enlarging. The focus is on the person: they are sharp, things a few meters behind them are noticeably soft, and far-off signs and writing are blurred and unreadable, the natural falloff of a real lens rather than an artificial portrait blur.'
const SKIN_CLEAN = 'Skin: plain and matte, simply clean: an even natural tone, no shine, sweat or glossy highlights on the forehead, nose or cheeks, no painted-on color or contouring, no blemishes, rough patches, redness, stubble shadow or grime, and not airbrushed or plastic either.'

/** The camera line for photos without a person: the beauty-app words only invite a face. */
const CAMERA_NO_PEOPLE = 'Straight out of the phone\'s default camera app: no portrait mode, no editing. Whatever is further away is a little softer than the subject, never an artificial portrait blur.'

/**
 * Mistakes staff caught in drawn photos (2026-10): a sunset over Haeundae,
 * which faces east; a Han River sunset behind Lotte World Tower, which
 * stands east of where people watch it; a right leg ending in a left foot.
 */
const WORLD = 'The world in the photo is physically right. The sun rises in the east and sets in the west: a sunset or a setting sun only ever appears in a view facing west, so a coast or riverbank facing east (Haeundae, Gwangalli, the east coast) gets a sunrise or a sky lit from behind the camera, never a sun setting into the water. Real landmarks appear only where they really stand as seen from that spot. Bodies are anatomically right: a right leg ends in a right foot and a left leg in a left foot, shoes are a matching pair, hands have five fingers, limbs join where they should. A mirror selfie shows that it is one: unless the mirror is a whole wall, its edge or frame is in the picture with the unreflected room visible just past it (a thin edge, never a bare black bar), and the phone appears in the reflection held the way a hand really holds it. Small print (book pages, menus, labels, far signs) is never legible in a phone snapshot: it is seen at an angle, partly covered or a little soft, never a page of crisp invented characters. Handwriting looks like a real person\'s quick notes, not a handwriting font: slanted and hurried, letters uneven in size, lines drifting off the ruling, some words squeezed in or abbreviated, a few cross-outs, arrows, circled words and highlighter, often two pen colors, and only part of the page filled.'

const LIGHT = 'Light: only what the place itself gives, with its natural falloff (the sky, a window, ceiling lights or street lamps); soft natural shadows; mixed color temperatures where different lights meet; whites that are slightly grey or slightly warm, not pure.'
const FACE_LIGHT = 'Any face is lit like its surroundings and no more brightly: no extra light falling on the face.'
const COLORS = 'Colors are muted and true to life, like an uncorrected phone photo, with moderate contrast: no boosted saturation, no HDR halo, no color grade, no glow, no rim light, no dramatic shadows.'

/**
 * Detail density. Image models crowd a scene with small decorative objects
 * and render every one of them, which turns into a gritty, crawling texture
 * (staff and a ChatGPT image community found the same, 2026-10).
 */
const DETAIL = 'Controlled detail density: a few clear things in the scene rather than a crowd of small objects; no random decorative clutter; the background is simpler and less detailed than the subject. Skin sits between the two AI extremes: neither gritty and textured nor smooth, uniform and glossy, just quiet matte skin with soft natural variation in tone.'

const TEXTURE = 'Every surface has its real material and only the shine it really has: matte walls, knit and cotton fabric, faded denim, scuffed leather, smudged glass, worn wood, dull metal, all rendered softly at the level of detail a phone really resolves, not over-detailed. Nothing looks waxed, glossy, plastic or rendered.'

/** Everyday objects whose colors clash with the scene; they are what a styled picture leaves out. */
const CLASHING_COLORS: Record<PhotoEnvironment, string> = {
  outdoor: 'a bright green or neon shop sign, a blue plastic trash bin, a red fire extinguisher box on a wall, an orange traffic cone, a parked scooter',
  indoor: 'a bright plastic water bottle, a colored charger cable, a red or yellow takeaway bag, a green plant pot, a sticky note on the wall',
  any: 'a bright plastic bottle, a colored sign, a blue bin, a red or orange object off to one side',
}

const SKIN = 'Skin: real, matte skin with slight unevenness in tone, pores only faintly visible up close, makeup that sits on the skin rather than looking airbrushed; the skin is smooth in tone, never gritty, grainy or crawling with texture. No shine or sweat sheen anywhere on the face; no porcelain, waxy or glossy skin.'

const PEOPLE = 'Clothes crease and hang naturally; the expression is relaxed and caught mid-moment, not a posed photo smile.'

const HAIR: Record<PhotoEnvironment, string> = {
  outdoor: 'Hair: a light breeze moves it a little, one loose strand across the face at most. The hair reads as soft clumps and locks the way a phone resolves it, not hundreds of individually drawn strands. The hairstyle keeps its shape.',
  indoor: 'Hair: not arranged for the photo, slightly uneven, one loose strand at most. The hair reads as soft clumps and locks the way a phone resolves it, not hundreds of individually drawn strands. The hairstyle keeps its shape.',
  any: 'Hair: not arranged for the photo, one loose strand at most. The hair reads as soft clumps and locks the way a phone resolves it, not hundreds of individually drawn strands. The hairstyle keeps its shape.',
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

const AVOID_FACE = 'Keep any face proportions exactly as described; do not average them toward a typical face. Avoid an averaged beauty face with big round eyes, a tiny pointed nose and a V-line chin, a face lit more brightly than its surroundings, a retouched or beauty-filtered face, perfectly arranged hair, glossy or airbrushed skin.'
const AVOID = 'Avoid everything that marks an AI, stock or retouched image: an overall plastic sheen, gritty or noisy micro-texture, excessive fine detail, over-rendered backgrounds, messy individually drawn hair strands, excessive bloom, oversaturated colors, shallow depth of field, a magazine or advertising look.'

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
  options: { people?: boolean; faces?: boolean; environment?: PhotoEnvironment; focusOnPerson?: boolean; lens?: PhoneLens } = {},
): string {
  const environment = options.environment ?? 'any'
  const people = options.people !== false
  // A back or body photo has a person but no visible face.
  const faces = options.faces ?? people
  return [
    ...(people ? [options.focusOnPerson ? CAMERA_FOCUSED : CAMERA[0], CAMERA[1]] : [CAMERA_NO_PEOPLE, CAMERA[1]]),
    ...(options.lens ? [LENS[options.lens]] : []),
    LIGHT,
    WORLD,
    ...(faces ? [FACE_LIGHT] : []),
    COLORS,
    TEXTURE,
    DETAIL,
    `Somewhere in the background one everyday object whose color does not match the scene, such as ${CLASHING_COLORS[environment]}.`,
    ...(people ? [options.focusOnPerson ? SKIN_CLEAN : SKIN, HAIR[environment], PEOPLE] : []),
    // People taking their own photo frame it with some care, so fewer flaws there.
    `Imperfections in this photo: ${pickFlaws(random, people ? 2 : 3).join('; ')}.`,
    ...(faces ? [AVOID_FACE] : []),
    options.focusOnPerson ? AVOID.replace('shallow depth of field, ', '') : AVOID,
  ].join('\n')
}
