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
  'Straight out of the phone\'s default camera app: no portrait mode, no beauty app, no face slimming, no eye enlarging, no added blush or glow. The background is a little softer than the subject, the way a phone\'s main camera renders things further away, never an artificial portrait blur.',
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
const SKIN_CLEAN = 'Skin: smooth and soft, the way a phone renders a face at an ordinary distance: an even natural tone with no visible pores or fine texture, matte, with no shine, sweat or glossy highlights on the forehead, nose or cheeks, no painted-on color or contouring, no blemishes, rough patches, redness, stubble shadow or grime; still real skin, not plastic, waxy or porcelain.'

/** The camera line for photos without a person: the beauty-app words only invite a face. */
const CAMERA_NO_PEOPLE = 'Straight out of the phone\'s default camera app: no portrait mode, no editing. Whatever is further away is a little softer than the subject, never an artificial portrait blur.'

/**
 * Mistakes staff caught in drawn photos (2026-10): a sunset over Haeundae,
 * which faces east; a Han River sunset behind Lotte World Tower, which
 * stands east of where people watch it; a right leg ending in a left foot.
 */
const WORLD = 'The world in the photo is physically right. Real landmarks appear only where they really stand as seen from that spot. Everyday places keep their real layout: in a Seoul subway car the hanging straps and overhead bars run above the long side seats, while the door areas have only vertical poles and no straps; a person holding a strap stands in front of the seats, not by the doors. The seats there are one long low bench under the windows made of individually contoured seats with blue fabric cushions (a pink seat for pregnant passengers at the end), short seat backs reaching just below the window, and a stainless-steel end panel with a glass screen beside the doors; never grey metal slabs or airline-style seats. Bodies are anatomically right: a right leg ends in a right foot and a left leg in a left foot, shoes are a matching pair, hands have five fingers, limbs join where they should, and the head turns only as far as a neck really turns: someone looking back over the shoulder turns the shoulders and upper body too, never just the head twisted round on a still body. A mirror selfie shows that it is one: unless the mirror is a whole wall, its edge or frame is in the picture with the unreflected room visible just past it (a thin edge, never a bare black bar), and the phone appears in the reflection held the way a hand really holds it. Small print (book pages, menus, labels, far signs) is never legible in a phone snapshot: it is seen at an angle, partly covered or a little soft, never a page of crisp invented characters. Any screen in view (a laptop, monitor, TV, tablet, phone or digital sign) shows no readable text or interface: it is dark, washed out by glare, turned away, or its content is a soft pixelated blur like a mosaic. No handwriting, notebook pages or practice sheets in the picture. No traffic cones and no trash, recycling or rubbish bins anywhere in the picture, indoors or out.'

/**
 * Only for scenes that already have a low sun: said to every photo, the
 * sunset line itself pulled photos toward sunsets (staff, 2026-11).
 */
const SUN = 'The sun rises in the east and sets in the west: a setting sun only ever appears in a view facing west, so a coast or riverbank facing east (Haeundae, Gwangalli, the east coast) gets a sunrise or a sky lit from behind the camera, never a sun setting into the water.'
const LOW_SUN = /sunset|sunrise|setting sun|dusk|golden hour|evening sun|late-afternoon sun|low sun/i

const LIGHT = 'Light: only what the place itself gives, with its natural falloff (the sky, a window, ceiling lights or street lamps); soft natural shadows; mixed color temperatures where different lights meet; whites that are slightly grey or slightly warm, not pure.'
const FACE_LIGHT = 'Any face is lit like its surroundings and no more brightly: no extra light falling on the face. Sunlit skin stays matte, a broad soft brightness with no shiny specular spots on the nose, forehead, cheekbones or lips.'
/** Only for dim scenes: said to every photo, it pulled daytime photos toward dusk too (staff, 2026-11). */
const FACE_DIM = 'In dim evening or night light the face is as dim and slightly soft as the street around it, never cleanly and evenly lit.'
const DIM = /\b(dim|night|evening|dusk|sunset|twilight|after dark|street ?lamps?|neon|candle ?lit|lamp-lit)\b/i
const COLORS = 'Colors are true to life, like an uncorrected phone photo: clear and bright in sunshine, softer under clouds; no boosted saturation, no HDR halo, no color grade, no glow, no rim light, no dramatic shadows.'

/**
 * When the photo was taken and how the place is lit. Left unsaid, the model
 * drew nearly every post photo in the same grey-blue, not-quite-bright light
 * or at dusk (staff, 2026-11), so a post photo whose description names no time
 * or weather gets one light situation from its kind of place, picked evenly:
 * 125 indoor (home, eatery, transit, workplace, other indoor places) and 40 outdoor,
 * mostly daytime. None names a sunset or dusk: naming one pulls photos toward it.
 */
export const PHOTO_LIGHTS: Readonly<Record<'home' | 'eatery' | 'transit' | 'work' | 'indoor' | 'outdoor', readonly string[]>> = {
  work: [
    'an open-plan office at noon: cool LED ceiling panels and bright windows along one side',
    'an office late at night, half the ceiling lights off, a desk lamp and monitor glow',
    'a glass-walled meeting room in flat, bright ceiling light',
    'a small startup office with big windows, afternoon sun falling across the desks',
    'a design studio with white walls and daylight from a skylight',
    'a cubicle under long fluorescent tubes, the windows far away',
    'an office pantry in bright light by the coffee machine',
    'a co-working lounge with warm pendant lamps and daylight from tall windows',
    'a desk by the window on a rainy day: grey window light and a warm desk lamp',
    'an empty office early in the morning, fresh sunlight just coming in low',
    'a hospital or clinic staff room in bright white fluorescent light',
    'a lab in bright, clean, clinical white light',
    'a classroom or academy at night under fluorescent light, the windows black',
    'a shop counter after closing time, only half the lights still on',
    'a photo studio lit by big soft studio lights',
    'a recording studio, dim, warm lamps and small glowing equipment lights',
    'a restaurant kitchen during service, bright light on stainless steel',
    'behind a café counter in the morning, sun on the coffee machine',
    'a warehouse under high bay lights',
    'a home-office corner at night, a monitor glow and a desk lamp',
    'an office lobby with tall windows at lunchtime, bright and airy',
    'a university lab room in the afternoon, sunlight through half-closed blinds',
    'an architecture studio with big north windows, soft even daylight over the desks',
    'rows of desks and screens in cool, even office light',
    'a beauty salon workstation under bright white task lamps',
  ],
  home: [
    'morning sun through an east window, bright stripes of sunlight across the bedding and floor',
    'bright overcast daylight from a big window, soft even light filling the room',
    'around noon, sunlight bouncing off white walls, the room airy and bright',
    'sheer white curtains diffusing strong daylight, everything soft and bright',
    'blinds half shut, slatted bars of sunlight across the wall and furniture',
    'a rainy afternoon: grey light from the window and a warm desk lamp switched on',
    'night, one warm bedside lamp on, the rest of the room in soft shadow',
    'night, a flat cool-white LED ceiling light, the plain bright light of an ordinary apartment',
    'night, only a string of small warm fairy lights and a desk lamp on',
    'late at night, the TV casting a soft changing glow, one small lamp on',
    'a kitchen at night under a bright fluorescent ceiling light',
    'a kitchen in morning sun, light falling across the counter, steam from a kettle',
    'a snowy day outside, bright cold white light reflecting into the room',
    'afternoon sun through a plant on the windowsill, leaf shadows on the wall',
    'evening, a warm yellow pendant over the dining table, the windows black',
    'bright white vanity lights around a bathroom mirror',
    'a small studio flat at noon, one window of daylight plus a cool LED panel',
    'a dorm room where fluorescent ceiling light mixes with daylight from one window',
    'a glassed-in balcony at midday, full sun, a laundry rack in the corner',
    'a warm floor lamp bounced off the ceiling, cosy and evenly dim',
    'mid-afternoon with the curtains open, a bright sunlit rectangle on the floor',
    'night, a desk lit by a colourful LED strip and a white desk lamp',
    'a couple of candles and a dim lamp, a quiet cosy evening',
    'bright daylight pouring down from a skylight',
    'night, the living room lamps on and city lights twinkling beyond the big window',
    'morning sun through yellow curtains, giving the room a warm cast',
    'a cloudy morning with the lights off, soft grey-white window light',
    'the entrance hallway by the front door, a warm entry light and a full-length mirror',
    'a traditional room with paper-screen windows glowing bright with daylight',
    'a sunny weekend late morning, the window open and the room full of light',
  ],
  eatery: [
    'a bright café with floor-to-ceiling windows at noon, white walls and pale wood',
    'a moody café at night, warm spotlights over each table, the windows dark',
    'a café window seat in morning sun, the drink and table brightly lit',
    'a Korean barbecue place: bright fluorescent light, a little smoke haze under the steel exhaust hoods',
    'a street tent bar at night, an orange tarp glowing from bare bulbs inside',
    'a small pub with warm amber lanterns and wooden walls',
    'a convenience store at night: bright white fluorescent light, the windows black',
    'a bakery in daytime, warm display-case lights on the bread',
    'a busy food court under bright even LED ceiling light',
    'a café terrace at noon under a parasol: bright shade, sunlit street beyond',
    'a basement bar with pink and blue neon signs tinting everything',
    'a noodle shop on a rainy day, steamed-up windows, bright inside',
    'a brunch spot with white tiles and a big skylight, very bright',
    'a traditional restaurant with paper lanterns and dark wood, afternoon light from the door',
    'a pastel dessert café in soft, bright daylight',
    'a late-night ramen counter under warm bare bulbs',
    'a karaoke room: dark, with coloured disco lights sweeping the walls',
    'a campus cafeteria under bright fluorescent tubes',
    'a chain coffee shop in the evening, bright white LED light, the street dark outside',
    'a wine bar with candles on every table, warm and dim',
    'a beer pub, bright and lively, sports on the TVs on the wall',
    'a café on a cloudy day: soft grey window light and warm pendant lamps',
    'a street-side café on a sunny afternoon, hard window light and strong shadows across the table',
    'a hotel lounge with chandeliers and warm wall lamps',
    'a sushi bar with bright, clean white counter lights',
    'a snack bar in daytime, bright plain ceiling lights, steam rising from the pan',
    'a café full of plants under a glass greenhouse roof, bright and green',
    'a book café on a rainy evening, warm reading lamps over the tables',
    'a bubble tea shop, bright glowing menu boards behind the counter',
    'a big brewery hall with industrial pendant lights and daylight from high windows',
  ],
  transit: [
    'a subway car in daytime: bright cool fluorescent light, dark tunnel walls in the windows',
    'a subway train running above ground in sunshine, light streaming across the seats',
    'a city bus in morning sun, light flickering through the windows',
    'a night bus: a dim interior, city lights streaking past outside',
    'a train with big windows on a bright overcast day, countryside rolling by',
    'an airplane window seat, bright white clouds and sun outside',
    'a taxi back seat at night, street lights sliding past',
    'a subway platform under bright LED light, glass screen doors',
    'an airport terminal with huge glass walls around noon',
    'a bus on a rainy day, droplets on the window, grey but bright',
  ],
  indoor: [
    'a department store floor in bright, even white light',
    'a clothing-shop fitting room with a warm spotlight overhead',
    'a bookstore in daytime, warm shelf lights and daylight from the entrance',
    'a library with tall windows in soft afternoon light',
    'a gym under bright overhead LED panels, mirrors along the wall',
    'a bowling alley under bright lane lights',
    'a gallery with white walls and track spotlights',
    'an elevator with brushed-steel walls and a bright ceiling panel',
    'a photo booth in flat, bright white light',
    'a cinema lobby at night, glowing posters and neon trim',
    'a drugstore aisle in bright white shop light',
    'a sauna lounge with warm wooden walls and soft yellow lights',
    'a hair salon in front of a bright lit mirror',
    'an underground shopping arcade lit by the shops\' bright fronts',
    'a botanical glasshouse, bright diffuse light through the glass',
    'an arcade game centre, dark with colourful glowing machines',
    'a climbing gym under bright warehouse lights',
    'an aquarium, dark except for the blue glow of the tanks',
    'a flower shop with a sunlit front window',
    'a hotel room in daytime, sheer curtains glowing with sunlight',
    'a stairwell lit by a tall window, a stripe of sun on the steps',
    'a cosmetics store in very bright white light',
    'a small record shop, warm and dim',
    'a pottery workshop with daylight from big windows',
    'an indoor market hall under skylights',
    'a building lobby at night, warm downlights, the glass doors dark',
    'a study café: dim room, each desk under its own lamp',
    'a laundromat at night under bright fluorescent light',
    'a PC café, dim, the room lit by monitor glow',
    'inside a parked car in daylight, sun on the dashboard',
  ],
  outdoor: [
    'a bright, clear day around noon: full sunshine, a deep blue sky, crisp short shadows',
    'a fresh sunny morning: clean bright sunlight, a pale clear blue sky, long soft shadows',
    'a bright afternoon with big white clouds in a blue sky, the sun now and then behind a cloud',
    'a hot, cloudless midday, harsh overhead sun and deep shadows under trees',
    'a crisp autumn day, bright sun, vivid yellow and red leaves',
    'a clear winter day, bright cold sun, a sharp blue sky, breath slightly visible',
    'a light snowfall in daytime, everything soft white and bright',
    'just after snow: sunshine on white snow, very bright',
    'a cloudy but bright day, even white-grey sky, soft shadowless light',
    'a light drizzle: wet shiny pavement, umbrellas, a grey sky',
    'just after rain: puddles reflecting a clearing blue sky, everything washed clean',
    'a windy sunny day, hair and leaves blowing, bright light',
    'spring sunshine, soft warm light, fresh green leaves',
    'a hazy bright day, the sky pale and whitish, soft sunlight',
    'late morning sun from the side, bright with clear shadows',
    'early afternoon in dappled shade under trees, spots of sunlight',
    'bright sun reflecting off glass buildings, sparkling and clear',
    'a summer day with strong sunlight and saturated green trees',
    'a mild sunny day with a few thin high clouds',
    'bright sun in a narrow street: one side in sunlight, the other in cool shade',
    'night in a busy street: shop signs, neon and street lamps in warm and cool colours',
    'night by the water: city lights reflected on the surface, a black sky',
    'night in a quiet residential street under yellow street lamps',
    'night at a lit-up market or festival, strings of bulbs overhead',
    'night in the rain, coloured lights reflected on the wet ground',
    'night in front of a brightly lit shop window',
    'a foggy morning, soft and pale, things far away fading out',
    'bright midday on a beach, white sand, sparkling water',
    'a sunny day in a park, kids and dogs around, bright green grass',
    'on a mountain trail around noon, clear air, bright sun',
    'a sunny day at a viewpoint, a clear view far into the distance',
    'a bright overcast day in the city, soft light, colours clear',
    'a sunny crosswalk at noon, strong shadows of people on the stripes',
    'a breezy autumn afternoon, sun low in the south, warm side light',
    'a bright, cool morning with a little mist rising from the river',
    'mid-afternoon under a striped awning, bright street behind',
    'a sunny rooftop at noon, a wide blue sky',
    'a light rain under a clear umbrella, the street a little blurred and grey',
    'a clear day with a bright blue sky reflected in shop windows',
    'night under bright stadium or plaza floodlights',
  ],
}

const STATED_TIME = /\b(night|evening|dusk|sunset|sunrise|dawn|twilight|after dark|morning|noon|midday|afternoon|daylight|daytime|sunny|sunshine|sunlit|sunlight|rain|rainy|raining|snow|snowy|overcast|cloudy|golden hour|neon|street ?lamps?)\b/i

/** A workplace: checked before the other places, since a work desk would otherwise read as home. */
const WORKPLACE = /\b(office|workplace|at work|work desk|meeting room|conference room|co-?working|coworkers?|colleagues?|design studio|photo studio|recording studio|lab|laboratory|clinic|hospital|ward|classroom|academy|hagwon|warehouse|overtime|shift|behind the counter)\b/i

/** The time and light line for a post photo, from its kind of place, or null when the description already says when it was taken. */
export function pickPhotoTime(random: Random, scene: string): string | null {
  if (STATED_TIME.test(scene)) return null
  if (WORKPLACE.test(scene)) return PHOTO_LIGHTS.work[Math.floor(random() * PHOTO_LIGHTS.work.length)]
  const kind = sceneKindOf(scene)
  const pool = PHOTO_LIGHTS[kind === 'nature' || kind === 'street' ? 'outdoor' : kind]
  return pool[Math.floor(random() * pool.length)]
}

/**
 * Detail density. Image models crowd a scene with small decorative objects
 * and render every one of them, which turns into a gritty, crawling texture
 * (staff and a ChatGPT image community found the same, 2026-10).
 */
const DETAIL = 'Controlled detail density: a few clear things in the scene rather than a crowd of small objects; no random decorative clutter; the background is simpler and less detailed than the subject. Skin is smooth and soft rather than textured: matte, never glossy or waxy, with soft natural variation in tone.'

const TEXTURE = 'Every surface has its real material and only the shine it really has: matte walls, knit and cotton fabric, faded denim, scuffed leather, smudged glass, worn wood, dull metal, all rendered softly at the level of detail a phone really resolves, not over-detailed. Nothing looks waxed, glossy, plastic or rendered.'

/**
 * The kind of place a photo is taken in, read from its description, so an
 * off-color object in the background is one that really belongs there.
 */
export type SceneKind = 'nature' | 'street' | 'eatery' | 'home' | 'transit' | 'indoor'

export function sceneKindOf(text: string, environment: PhotoEnvironment = 'any'): SceneKind {
  const t = text.toLowerCase()
  if (/(?<!\p{L})(train|subway|metro|bus|carriage|platform|airplane|plane|ktx)(?!\p{L})/u.test(t)) return 'transit'
  if (/(?<!\p{L})(café|cafe|coffee|restaurant|bar|pub|pojangmacha|barbecue|bbq|diner|bakery|noraebang|karaoke|food court|izakaya|market stall)(?!\p{L})/u.test(t)) return 'eatery'
  if (/(?<!\p{L})(bedroom|living room|bed|sofa|couch|desk|kitchen|dorm|apartment|home|room)(?!\p{L})/u.test(t)) return 'home'
  if (/(?<!\p{L})(park|forest|mountain|summit|hiking|trail|beach|sea|coast|river|lake|riverside|garden|field|meadow|cherry blossom|ginkgo|trees|countryside|valley|waterfall|island|hangang)(?!\p{L})/u.test(t)) return 'nature'
  if (/(?<!\p{L})(street|alley|road|crosswalk|sidewalk|downtown|shop window|shopping|neighborhood|city)(?!\p{L})/u.test(t)) return 'street'
  return environment === 'outdoor' ? 'street' : 'indoor'
}

/**
 * Off-color things a styled picture leaves out, each one that belongs in that
 * kind of place. Staff caught the same orange cone and blue-green bin in
 * photo after photo, a cone even in a riverside park (2026-10): one object is
 * drawn per photo, from the place's own pool, and many photos get none. Bins
 * and cones kept coming anyway, so WORLD bans them outright.
 */
const OFF_COLOR_OBJECTS: Record<SceneKind, readonly string[]> = {
  nature: [
    'someone far off in a bright red jacket', 'a child\'s yellow balloon in the distance', 'a picnic mat with a loud check pattern a few meters away',
    'a turquoise rental bike leaning on a rail', 'a dog in a neon-green harness passing by', 'a pink umbrella someone is carrying in the distance',
    'a faded orange park sign', 'a purple jacket hung over a bench',
  ],
  street: [
    'a red delivery scooter parked at the curb', 'a passer-by in a mustard-yellow coat', 'a pink shop awning', 'a stack of colored plastic crates outside a shop',
    'a lime-green bicycle locked to a rail', 'a red postbox', 'a striped parasol over a street stall', 'a white van with a bright logo-less blue stripe',
  ],
  eatery: [
    'a red squeeze bottle of sauce', 'a customer\'s yellow raincoat on the next chair', 'a pink takeaway bag on a counter', 'a bright green glass bottle on another table',
    'an orange tray stacked by the counter', 'a blue cooler box under a table', 'a potted plant in a loud turquoise pot',
  ],
  home: [
    'a bright green water bottle', 'a pink charger cable trailing off a desk', 'a yellow sticky note on the wall', 'an orange laundry basket in a corner',
    'a red snack bag on a shelf', 'a teal mug', 'a purple hair tie on the table', 'a striped beach towel over a chair',
  ],
  transit: [
    'a passenger\'s bright yellow backpack', 'a pink seat among blue ones', 'a lime-green line color on the route map above the doors', 'someone\'s red shopping bag on the floor',
  ],
  indoor: [
    'a red fire extinguisher on a wall', 'a bright yellow wet-floor sign', 'a lime-green notice on a board', 'a pink umbrella leaning by a door',
    'an orange chair among grey ones', 'a blue water dispenser bottle',
  ],
}

/** One off-color object for this photo, or none: real photos do not all have one. */
function offColorObject(random: Random, kind: SceneKind): string | null {
  if (random() < 0.5) return null
  const pool = OFF_COLOR_OBJECTS[kind]
  return pool[Math.floor(random() * pool.length)]
}

const SKIN = 'Skin: smooth and soft at phone distance, an even matte tone with only slight natural variation; pores and fine texture are not visible; makeup sits on the skin rather than looking airbrushed; never gritty, grainy or crawling with texture. No shine or sweat sheen anywhere on the face; no porcelain, waxy or glossy skin.'

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
  options: { people?: boolean; faces?: boolean; environment?: PhotoEnvironment; focusOnPerson?: boolean; lens?: PhoneLens; scene?: string; pickTime?: boolean } = {},
): string {
  const environment = options.environment ?? 'any'
  const people = options.people !== false
  // A back or body photo has a person but no visible face.
  const faces = options.faces ?? people
  const offColor = offColorObject(random, sceneKindOf(options.scene ?? '', environment))
  const time = options.pickTime ? pickPhotoTime(random, options.scene ?? '') : null
  return [
    ...(people ? [options.focusOnPerson ? CAMERA_FOCUSED : CAMERA[0], CAMERA[1]] : [CAMERA_NO_PEOPLE, CAMERA[1]]),
    ...(options.lens ? [LENS[options.lens]] : []),
    ...(time ? [`Time and light, like this: ${time}. Take only the time, weather and light from it; the place stays the one described above.`] : []),
    LIGHT,
    WORLD,
    ...(LOW_SUN.test(options.scene ?? '') ? [SUN] : []),
    ...(faces ? [FACE_LIGHT] : []),
    ...(faces && DIM.test(`${options.scene ?? ''} ${time ?? ''}`) ? [FACE_DIM] : []),
    COLORS,
    TEXTURE,
    DETAIL,
    ...(offColor ? [`Somewhere in the background, small and incidental: ${offColor}. Nothing else is added just for color.`] : ['Add no stray objects just for color; the place keeps only what it really has.']),
    ...(people ? [options.focusOnPerson ? SKIN_CLEAN : SKIN, HAIR[environment], PEOPLE] : []),
    // People taking their own photo frame it with some care, so fewer flaws there.
    `Imperfections in this photo: ${pickFlaws(random, people ? 2 : 3).join('; ')}.`,
    ...(faces ? [AVOID_FACE] : []),
    options.focusOnPerson ? AVOID.replace('shallow depth of field, ', '') : AVOID,
  ].join('\n')
}
