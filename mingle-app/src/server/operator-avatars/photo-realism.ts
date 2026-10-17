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
  'Ordinary light from whatever is there (a window, ceiling lights, overcast sky), never cinematic: no rim light, no golden glow, no dramatic shadows, no color grading.',
]

const PEOPLE = 'If a person is in the frame: real skin texture with pores, small blemishes and uneven tone; flyaway hairs; creased clothes; an unposed, in-between expression or a small natural smile, not a model\'s pose; ordinary proportions.'

const AVOID = 'Avoid everything that marks an AI or stock image: centered symmetric composition, perfectly clean surfaces, glossy or airbrushed skin, glowing light, shallow depth of field, a magazine or advertising look, an overly pretty "aesthetic" scene.'

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
    ...SCENE,
    ...(options.people === false ? [] : [PEOPLE]),
    `Imperfections in this photo: ${pickFlaws(random).join('; ')}.`,
    AVOID,
  ].join('\n')
}
