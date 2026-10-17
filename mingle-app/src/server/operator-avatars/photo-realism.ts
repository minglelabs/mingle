/**
 * What keeps a generated photo from looking generated. Image models drift to
 * the same look: a centered, posed subject, glowing light, blurred background,
 * flawless skin and a spotless scene. Saying "realistic" or "casual" does not
 * help, and "aesthetic" words make it worse. What helps is describing a phone
 * photo the way it really comes out: the default camera, everything in focus,
 * awkward framing, a place with wear and clutter, and a moment rather than a
 * pose. Every photo gets the fixed lines plus a few randomly chosen flaws, so
 * a set of photos does not share the same flaw either.
 */
type Random = () => number

const CAMERA = [
  'Shot with the phone\'s default camera app, main lens, no portrait mode: the background is as sharp as the subject, no artificial bokeh.',
  'Phone-camera rendering: slightly over-sharpened edges, small-sensor noise in the shadows, auto exposure that blows out windows or the sky a little, auto white balance that is a bit off (slightly too warm or too cool).',
]

const SCENE = [
  'The place looks used and real: scuffs, scratches, dust, fingerprints, cables, receipts, a half-empty cup, signs or furniture cut off at the edge of the frame.',
]

/**
 * Light, skin and surfaces are where generated photos give themselves away
 * most: everything has the same plastic sheen. These lines go in every photo.
 */
const LIGHT = [
  'Light: only what the place itself gives, with its natural falloff and direction (from a window, the sky, ceiling lights or street lamps); soft shadows under the chin, nose and furniture; mixed color temperatures where different lights meet; whites that are slightly grey or slightly warm, not pure.',
  'Colors are muted and true to life, like an uncorrected phone photo: no boosted saturation, no HDR halo, no teal-and-orange grade, no glow, no rim light, no dramatic shadows.',
]

const TEXTURE = [
  'Every surface has its real texture and only the shine it really has: matte walls, fabric with visible weave or knit ribs and pilling, faded denim, scuffed leather, smudged and scratched glass, worn wood, dull metal. Nothing looks waxed, glossy, plastic or rendered.',
]

const SKIN = 'Skin: real, matte skin with visible pores, fine texture and slight unevenness in tone, a little natural shine only on the forehead or nose, makeup that sits on the skin rather than looking airbrushed; individual hair strands and flyaways, hair that is not perfectly shiny. No smooth, porcelain, waxy or glossy skin, no beauty-filter look.'

const PEOPLE = 'If a person is in the frame: creased clothes that hang naturally; an unposed, in-between expression or a small natural smile, not a model\'s pose; ordinary proportions.'

const AVOID = 'Avoid everything that marks an AI or stock image: an overall plastic sheen, centered symmetric composition, perfectly clean surfaces, glossy or airbrushed skin, glowing light, oversaturated colors, shallow depth of field, a magazine or advertising look, an overly pretty "aesthetic" scene.'

const FLAWS = [
  'the frame is tilted a few degrees',
  'the subject sits off-center and part of it is cut off by the edge of the frame',
  'something in the foreground (a finger edge, a cup, a railing) intrudes slightly',
  'slight motion blur on one moving part',
  'a little lens flare or haze from a dirty phone lens',
  'too much empty floor, wall or sky above or below the subject',
  'one area is slightly overexposed and another a bit too dark',
  'taken from a slightly awkward low or high angle, as if snapped quickly',
  'a stranger or object partly visible in the background, out of place',
  'the focus landed a little off, on the background instead of the subject',
]

/** Three different flaws for one photo. */
function pickFlaws(random: Random): string[] {
  const pool = [...FLAWS]
  const picked: string[] = []
  while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  return picked
}

/** The realism block appended to every operator photo prompt. */
export function phonePhotoRealism(random: Random = Math.random, options: { people?: boolean } = {}): string {
  return [
    ...CAMERA,
    ...LIGHT,
    ...SCENE,
    ...TEXTURE,
    ...(options.people === false ? [] : [SKIN, PEOPLE]),
    `Imperfections in this photo: ${pickFlaws(random).join('; ')}.`,
    AVOID,
  ].join('\n')
}
