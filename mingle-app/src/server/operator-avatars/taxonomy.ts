/**
 * What an operator account's profile photo shows, picked by the server so
 * that 100 accounts end up with 100 visibly different photos: kind of photo,
 * how much of the person shows, appearance, build, outfit, pose, how it was
 * shot, and where. The image model only draws the picked spec.
 *
 * Pure data and pure functions (no server imports): the admin pages show the
 * Korean labels, and the picker is unit-tested with a seeded random.
 *
 * Fixed rules, whatever is picked: adults only, everyday or sports clothing
 * (never underwear, swimwear-only or a sexualized pose), no real person, no
 * existing character, no text or logo in the image.
 */
export const AVATAR_SPEC_VERSION = 1

export type AvatarCategory = 'face' | 'partial' | 'back' | 'body' | 'part' | 'group' | 'object' | 'animal' | 'scenery' | 'other'

export type AvatarPersona = {
  /** 'female' | 'male' | null (unknown: the model follows the name). */
  gender: string | null
  name: string | null
  age: number | null
  /** ISO 3166-1 alpha-2 persona country. */
  country: string | null
  countryName: string | null
  city: string | null
  bio: string | null
}

export type AvatarSpec = {
  version: number
  category: AvatarCategory
  subtype: string
  /** Staff-facing summary, e.g. "뒷모습 · 바다를 바라봄". */
  labelKo: string
  /** Every picked option by axis, for staff and for avoiding repeats. */
  attributes: Record<string, string>
  prompt: string
}

type Random = () => number
/** [key, weight, prompt fragment]. */
type Option = readonly [key: string, weight: number, text: string]

function pick(options: readonly Option[], random: Random): Option {
  const total = options.reduce((sum, option) => sum + option[1], 0)
  let roll = random() * total
  for (const option of options) {
    roll -= option[1]
    if (roll < 0) return option
  }
  return options[options.length - 1]
}

// ─── 1. Kind of photo ────────────────────────────────────────────────────────

export const AVATAR_CATEGORIES: ReadonlyArray<{ key: AvatarCategory; ko: string; weight: number }> = [
  { key: 'face', ko: '얼굴 위주', weight: 27 },
  { key: 'partial', ko: '얼굴 일부·가림', weight: 14 },
  { key: 'back', ko: '뒷모습', weight: 11 },
  { key: 'body', ko: '몸 위주', weight: 13 },
  { key: 'part', ko: '손·발·부분', weight: 5 },
  { key: 'group', ko: '여러 명', weight: 5 },
  { key: 'object', ko: '사물', weight: 12 },
  { key: 'animal', ko: '동물', weight: 8 },
  { key: 'scenery', ko: '풍경·장소', weight: 4 },
  { key: 'other', ko: '기타', weight: 1 },
]

/** East Asian profiles hide the face more; Western and Latin American ones show it more. */
const FACE_SHY_COUNTRIES = new Set(['KR', 'JP', 'TW', 'CN'])
const FACE_FORWARD_COUNTRIES = new Set(['US', 'CA', 'GB', 'AU', 'FR', 'DE', 'ES', 'IT', 'BR', 'MX', 'AR', 'TR'])

const CATEGORY_COUNTRY_FACTORS: Record<'shy' | 'forward', Partial<Record<AvatarCategory, number>>> = {
  shy: { face: 0.75, partial: 1.4, back: 1.3, object: 1.2, scenery: 1.2 },
  forward: { face: 1.3, body: 1.15, partial: 0.8, object: 0.8 },
}

/** Bio keywords (any language of the persona table) that pull the photo toward a subject. */
const BIO_HINTS: ReadonlyArray<{ pattern: RegExp; category: AvatarCategory; subtype?: string; factor: number }> = [
  { pattern: /cat|고양이|猫|ねこ|gato|chat\b|katze|kedi|mèo|แมว|kucing/i, category: 'animal', subtype: 'cat', factor: 4 },
  { pattern: /dog|강아지|犬|いぬ|perro|cachorro|chien|hund|köpek|chó|หมา|anjing/i, category: 'animal', subtype: 'dog', factor: 4 },
  { pattern: /gym|헬스|운동|筋トレ|ジム|fitness|academia|gimnasio|workout|健身/i, category: 'body', subtype: 'gym_mirror', factor: 3 },
  { pattern: /coffee|커피|카페|コーヒー|カフェ|café|kaffee|kahve|cà phê|咖啡/i, category: 'object', subtype: 'coffee', factor: 2.5 },
  { pattern: /travel|여행|旅行|viaj|voyage|reisen|seyahat|du lịch|เที่ยว/i, category: 'back', subtype: 'travel_landmark', factor: 2 },
  { pattern: /guitar|기타|ギター|music|음악|音楽|música|musique|müzik/i, category: 'object', subtype: 'instrument', factor: 2 },
  { pattern: /photo|사진|写真|カメラ|camera|foto/i, category: 'scenery', factor: 2 },
  { pattern: /book|책|독서|読書|libro|livre|buch|kitap/i, category: 'object', subtype: 'book', factor: 2 },
]

type Subtype = { key: string; ko: string; weight: number; text: string }

function sub(key: string, ko: string, weight: number, text: string): Subtype {
  return { key, ko, weight, text }
}

// ─── 2. Subtypes per kind ────────────────────────────────────────────────────

export const AVATAR_SUBTYPES: Record<AvatarCategory, readonly Subtype[]> = {
  face: [
    sub('front', '정면', 5, 'facing the camera straight on'),
    sub('front_gaze_off', '정면, 시선 비낌', 3, 'face toward the camera but eyes looking slightly off to the side'),
    sub('three_quarter', '45도 반측면', 5, 'face turned about 45 degrees from the camera'),
    sub('profile', '옆모습', 3, 'in full side profile, looking away'),
    sub('high_angle', '위에서 내려찍음', 3, 'shot from above with the arm stretched out, looking up at the phone'),
    sub('low_angle', '아래에서 올려찍음', 1.5, 'shot from slightly below chin level'),
    sub('head_down', '고개 숙임', 1.5, 'head tilted down, eyes lowered, caught mid-moment'),
    sub('look_back', '뒤돌아보는 순간', 2, 'glancing back over the shoulder toward the camera'),
    sub('laughing', '웃다가 찍힘', 2, 'caught laughing, eyes half closed, not posed'),
    sub('lying_down', '누워서 셀카', 1, 'lying on a bed or sofa, phone held above the face'),
  ],
  partial: [
    sub('mirror_phone', '폰으로 가린 거울 셀카', 5, 'a mirror selfie where the phone covers most of the face'),
    sub('hand_cover', '손으로 가림', 3, 'one hand covering the mouth or one eye'),
    sub('mask', '마스크', 2.5, 'wearing a plain face mask, only the eyes visible'),
    sub('sunglasses', '선글라스', 2.5, 'wearing sunglasses that hide the eyes'),
    sub('cap_brim', '모자 챙', 2.5, 'a cap pulled low so the brim shadows the eyes'),
    sub('hair_cover', '머리카락으로 가림', 2, 'hair falling across half of the face'),
    sub('object_cover', '컵·꽃·책으로 가림', 2.5, 'holding a cup, a flower or a book in front of the lower face'),
    sub('cropped_half', '얼굴 절반 잘림', 3, 'framed so that only half of the face is inside the picture'),
    sub('below_eyes', '눈 아래만', 2, 'cropped so only the nose, lips and chin are in frame'),
    sub('backlit', '역광', 2, 'strongly backlit so the face is mostly in shadow'),
    sub('motion_blur', '흔들림', 1.5, 'slightly motion-blurred, the face soft and hard to make out'),
    sub('pet_cover', '반려동물로 가림', 1, 'holding a pet up so it covers part of the face'),
  ],
  back: [
    sub('sea_gaze', '바다를 바라봄', 3, 'seen from behind, standing and looking out at the sea'),
    sub('sunset_gaze', '노을을 바라봄', 3, 'seen from behind against a sunset sky'),
    sub('walking_street', '길 걷는 중', 3, 'seen from behind, walking down a street'),
    sub('stairs', '계단 오르는 중', 1.5, 'seen from behind, climbing outdoor stairs'),
    sub('window_gaze', '창밖을 봄', 2, 'seen from behind, looking out of a window'),
    sub('viewpoint', '전망대·다리 위', 2, 'seen from behind at a viewpoint or on a bridge, city or landscape beyond'),
    sub('travel_landmark', '여행지 앞', 2.5, 'seen from behind, standing in front of a well-known kind of travel sight'),
    sub('concert', '공연장', 1, 'seen from behind in a concert crowd, stage lights ahead'),
    sub('sitting_back', '앉은 뒷모습', 2, 'seen from behind, sitting on a bench, steps or the ground'),
    sub('arms_open', '팔 벌림', 1, 'seen from behind with both arms spread wide'),
    sub('tying_hair', '머리 묶는 중', 1, 'seen from behind, hands up tying the hair'),
    sub('head_shoulders', '머리·어깨만', 2, 'a close view of the back of the head and shoulders, the hairstyle the main subject'),
    sub('with_pet_walk', '반려동물과 산책', 1.5, 'seen from behind, walking a dog on a leash'),
    sub('bike', '자전거·오토바이', 1, 'seen from behind on a bicycle or scooter'),
    sub('far_small', '멀리서 작게', 2, 'a small figure seen from behind, far from the camera in a wide scene'),
  ],
  body: [
    sub('mirror_neck_down', '목 아래 거울 셀카', 4, 'a mirror selfie framed from the neck down, face out of frame'),
    sub('mirror_phone_up', '폰이 얼굴 위치인 거울 전신', 3, 'a full-length mirror selfie with the phone held exactly over the face'),
    sub('elevator_mirror', '엘리베이터 거울', 2, 'a full-body selfie in an elevator mirror, face cropped out at the top'),
    sub('fitting_room', '피팅룸 거울', 1.5, 'a fitting-room mirror selfie showing the outfit, head out of frame'),
    sub('ootd', '오늘의 옷차림', 3, 'an outfit photo taken by a friend, framed from the neck to the shoes'),
    sub('waist_down', '허리 아래(바지·신발)', 2, 'looking down at their own legs and shoes while standing'),
    sub('seated_outfit', '앉은 옷차림', 1.5, 'sitting on a chair or steps, framed from the shoulders down'),
    sub('gym_mirror', '헬스장 거울', 3, 'a gym mirror selfie in workout clothes showing the upper body and arms, face hidden by the phone'),
    sub('after_run', '러닝 후', 1.5, 'standing in running clothes after a run, framed from the neck down'),
    sub('yoga', '요가·필라테스', 1.5, 'holding a yoga pose on a mat, face turned away from the camera'),
    sub('hiking', '등산복 전신', 1.5, 'full body in hiking clothes on a trail, face turned away'),
    sub('sports_kit', '유니폼', 1.5, 'in a football or basketball kit on a court or pitch, framed from the neck down'),
    sub('beach_rashguard', '해변 래시가드', 1, 'on a beach in a rash guard and shorts, framed from the neck down'),
    sub('silhouette', '실루엣', 2, 'a full-body silhouette against a bright sky or window, no detail visible'),
    sub('shadow', '그림자', 1, 'only the person\'s long shadow on the ground or a wall'),
  ],
  part: [
    sub('hand_cup', '컵 든 손', 3, 'a hand holding a cup of coffee or tea'),
    sub('nails_ring', '네일·반지', 2, 'a hand showing a ring or simple manicure'),
    sub('watch', '시계', 1.5, 'a wrist with a watch'),
    sub('instrument_hand', '악기 치는 손', 1.5, 'hands playing a guitar or piano'),
    sub('pen_hand', '펜 든 손', 1.5, 'a hand writing in a notebook'),
    sub('sneakers', '운동화 신은 발', 3, 'their own feet in sneakers, seen from above'),
    sub('beach_feet', '해변 맨발', 1.5, 'bare feet at the edge of the waves on a beach'),
    sub('tattoo_arm', '문신 있는 팔', 1, 'a forearm with a small simple tattoo'),
  ],
  group: [
    sub('friends_selfie', '친구들과 셀카', 4, 'a group selfie with two or three friends, heads close together, the account owner holding the phone'),
    sub('two_friends', '친구와 둘이', 4, 'two friends side by side, shoulders touching, the account owner on the left'),
    sub('couple', '연인과', 2, 'a couple standing close, the partner\'s face turned away or partly out of frame'),
    sub('table_group', '식당·카페 모임', 3, 'four or five friends around a restaurant or cafe table, taken by someone at the end of the table'),
    sub('trip_group', '여행 단체 사진', 2, 'a small group of friends posing together outdoors on a trip, taken by a passer-by'),
    sub('family', '가족과', 1.5, 'the account owner with one or two adult family members, standing together'),
    sub('team', '동아리·팀', 1.5, 'a club or sports team lined up in matching casual kit, the account owner near the middle'),
    sub('friends_back', '친구들과 뒷모습', 2, 'three friends seen from behind, arms around each other\'s shoulders'),
  ],
  object: [
    sub('coffee', '커피', 4, 'a cup of coffee on a café table'),
    sub('latte_art', '라테아트', 2, 'latte art in a cup, seen from above'),
    sub('dessert', '디저트', 2.5, 'a dessert on a small plate'),
    sub('home_meal', '집밥', 2, 'a home-cooked meal typical of the persona\'s country on a table'),
    sub('local_dish', '그 나라 대표 음식', 2.5, 'a popular everyday dish of the persona\'s country in a casual restaurant'),
    sub('beer', '맥주잔', 1.5, 'a glass of beer on a bar table'),
    sub('instrument', '악기', 2, 'an acoustic guitar leaning against a wall'),
    sub('camera', '카메라', 1.5, 'a film camera on a desk'),
    sub('book', '책', 2, 'an open book with a drink beside it'),
    sub('game', '게임기·키보드', 1.5, 'a game controller or mechanical keyboard on a desk'),
    sub('art_tools', '그림 도구', 1, 'a sketchbook with pencils and paint'),
    sub('bicycle', '자전거·오토바이', 1.5, 'a parked bicycle or scooter on a street'),
    sub('ball', '축구공·농구공', 1, 'a football on grass'),
    sub('plant', '화분', 1.5, 'a potted plant by a window'),
    sub('flowers', '꽃다발', 2, 'a small bouquet of flowers held in a hand'),
    sub('plush', '인형·피규어', 1.5, 'a soft toy sitting on a bed'),
    sub('rain_window', '비 오는 창문', 1.5, 'raindrops on a window with blurred city lights behind'),
  ],
  animal: [
    sub('dog', '강아지', 5, 'a pet dog'),
    sub('cat', '고양이', 5, 'a pet cat'),
    sub('rabbit', '토끼', 0.7, 'a pet rabbit'),
    sub('hamster', '햄스터', 0.5, 'a pet hamster'),
    sub('bird', '새', 0.5, 'a pet parrot or budgie'),
    sub('street_cat', '길고양이', 1.5, 'a street cat sitting on a wall or pavement'),
    sub('fish_turtle', '물고기·거북이', 0.3, 'a pet fish or small turtle in a tank'),
  ],
  scenery: [
    sub('sunset', '노을', 3, 'a sunset sky'),
    sub('clouds', '구름', 1.5, 'clouds in a blue sky'),
    sub('night_sky', '밤하늘·달', 1.5, 'the moon in a night sky'),
    sub('sea', '바다 수평선', 2.5, 'the sea and horizon'),
    sub('mountain', '산', 1.5, 'a mountain view from a trail'),
    sub('city_night', '도시 야경', 2.5, 'a city skyline at night'),
    sub('plane_window', '비행기 창밖', 1.5, 'the view out of an airplane window over clouds'),
    sub('alley', '골목', 2, 'a quiet street or alley typical of the persona\'s city'),
    sub('landmark', '여행지', 1.5, 'a famous kind of landmark photographed like a tourist would'),
  ],
  other: [
    sub('doodle', '낙서풍 자화상', 3, 'a simple hand-drawn doodle self-portrait on paper, in an original style'),
    sub('watercolor', '수채화', 2, 'a small amateur watercolor painting of a landscape'),
    sub('emoji_plain', '단색 배경', 1, 'a plain pastel background with one small simple shape in the center'),
  ],
}

// ─── 3. Who is in the photo ──────────────────────────────────────────────────

type AncestryKey = 'east_asian' | 'southeast_asian' | 'south_asian' | 'white' | 'black' | 'latino' | 'middle_eastern' | 'mixed'

/** Ancestry mix per persona country: [label for the prompt, ancestry group, weight]. */
const COUNTRY_PEOPLE: Record<string, ReadonlyArray<readonly [string, AncestryKey, number]>> = {
  KR: [['Korean', 'east_asian', 1]],
  JP: [['Japanese', 'east_asian', 1]],
  TW: [['Taiwanese', 'east_asian', 1]],
  CN: [['Chinese', 'east_asian', 1]],
  VN: [['Vietnamese', 'southeast_asian', 1]],
  TH: [['Thai', 'southeast_asian', 1]],
  ID: [['Indonesian', 'southeast_asian', 1]],
  PH: [['Filipino', 'southeast_asian', 1]],
  MY: [['Malay Malaysian', 'southeast_asian', 6], ['Chinese Malaysian', 'east_asian', 3], ['Indian Malaysian', 'south_asian', 1]],
  SG: [['Chinese Singaporean', 'east_asian', 7], ['Malay Singaporean', 'southeast_asian', 2], ['Indian Singaporean', 'south_asian', 1]],
  IN: [['North Indian', 'south_asian', 6], ['South Indian', 'south_asian', 4]],
  US: [['white American', 'white', 55], ['Latino American', 'latino', 19], ['Black American', 'black', 13], ['East Asian American', 'east_asian', 5], ['South Asian American', 'south_asian', 3], ['mixed-race American', 'mixed', 5]],
  CA: [['white Canadian', 'white', 65], ['East Asian Canadian', 'east_asian', 12], ['South Asian Canadian', 'south_asian', 10], ['Black Canadian', 'black', 5], ['mixed-race Canadian', 'mixed', 8]],
  GB: [['white British', 'white', 80], ['British South Asian', 'south_asian', 9], ['Black British', 'black', 5], ['mixed-race British', 'mixed', 6]],
  AU: [['white Australian', 'white', 75], ['East Asian Australian', 'east_asian', 12], ['South Asian Australian', 'south_asian', 6], ['mixed-race Australian', 'mixed', 7]],
  FR: [['white French', 'white', 78], ['French of North African descent', 'middle_eastern', 12], ['Black French', 'black', 7], ['mixed-race French', 'mixed', 3]],
  DE: [['white German', 'white', 85], ['German of Turkish descent', 'middle_eastern', 10], ['mixed-race German', 'mixed', 5]],
  ES: [['Spanish', 'white', 9], ['Spanish with olive skin', 'latino', 1]],
  IT: [['Italian', 'white', 1]],
  BR: [['white Brazilian', 'white', 43], ['mixed-race (pardo) Brazilian', 'mixed', 45], ['Black Brazilian', 'black', 10], ['Japanese Brazilian', 'east_asian', 2]],
  MX: [['Mexican mestizo', 'latino', 9], ['light-skinned Mexican', 'white', 1]],
  AR: [['Argentine of European descent', 'white', 8], ['Argentine mestizo', 'latino', 2]],
  TR: [['Turkish', 'middle_eastern', 1]],
}

const SKIN_TONES: Record<AncestryKey, readonly Option[]> = {
  east_asian: [['fair', 3, 'fair skin'], ['light', 4, 'light skin'], ['light_medium', 2, 'light-medium skin'], ['tan', 1, 'lightly tanned skin']],
  southeast_asian: [['light_medium', 3, 'light-medium skin'], ['tan', 4, 'tan skin'], ['brown', 3, 'brown skin']],
  south_asian: [['medium', 3, 'medium-brown skin'], ['brown', 4, 'brown skin'], ['deep', 3, 'deep brown skin']],
  white: [['fair', 3, 'fair skin'], ['light', 4, 'light skin'], ['freckled', 1.5, 'light freckled skin'], ['tan', 1.5, 'lightly tanned skin']],
  black: [['brown', 3, 'brown skin'], ['deep', 4, 'deep brown skin'], ['dark', 3, 'dark skin']],
  latino: [['light', 2, 'light skin'], ['olive', 4, 'olive skin'], ['tan', 3, 'tan skin'], ['brown', 2, 'brown skin']],
  middle_eastern: [['light', 3, 'light skin'], ['olive', 5, 'olive skin'], ['tan', 2, 'tan skin']],
  mixed: [['light_medium', 3, 'light-medium skin'], ['tan', 4, 'tan skin'], ['brown', 3, 'brown skin']],
}

const NATURAL_HAIR: Record<AncestryKey, readonly Option[]> = {
  east_asian: [['black', 7, 'black'], ['dark_brown', 3, 'dark brown']],
  southeast_asian: [['black', 8, 'black'], ['dark_brown', 2, 'dark brown']],
  south_asian: [['black', 8, 'black'], ['dark_brown', 2, 'dark brown']],
  white: [['dark_brown', 3, 'dark brown'], ['light_brown', 3, 'light brown'], ['blonde', 2, 'blonde'], ['red', 0.6, 'red'], ['black', 1, 'black']],
  black: [['black', 9, 'black'], ['dark_brown', 1, 'dark brown']],
  latino: [['black', 5, 'black'], ['dark_brown', 4, 'dark brown'], ['light_brown', 1, 'light brown']],
  middle_eastern: [['black', 5, 'black'], ['dark_brown', 4, 'dark brown'], ['light_brown', 1, 'light brown']],
  mixed: [['black', 5, 'black'], ['dark_brown', 4, 'dark brown'], ['light_brown', 1, 'light brown']],
}

const DYED_HAIR: readonly Option[] = [
  ['brown_dye', 4, 'dyed warm brown'], ['ash', 2.5, 'dyed ash grey-brown'], ['blonde_dye', 2, 'bleached blonde'],
  ['pink', 0.7, 'dyed pastel pink'], ['blue', 0.5, 'dyed dark blue'], ['red_dye', 1, 'dyed wine red'],
]

const FACE_SHAPES: readonly Option[] = [
  ['round', 3, 'a round face'], ['oval', 4, 'an oval face'], ['square', 2, 'a square jaw'], ['long', 2, 'a long face'], ['heart', 2, 'a heart-shaped face'],
]

const SKIN_FEATURES: readonly Option[] = [
  ['clear', 5, 'ordinary skin with visible pores'], ['freckles', 1, 'a few freckles'], ['mole', 1.5, 'a small mole on the cheek'],
  ['acne_marks', 1.5, 'faint acne marks'], ['flush', 1, 'slightly flushed cheeks'], ['fine_lines', 1, 'faint lines around the eyes'],
]

const EYES: readonly Option[] = [
  ['monolid', 2, 'monolid eyes'], ['inner_fold', 2, 'subtle inner double eyelids'], ['double', 3, 'double eyelids'], ['large', 2, 'large eyes'],
  ['narrow', 2, 'narrow eyes'], ['downturned', 1.5, 'slightly downturned eyes'], ['upturned', 1.5, 'slightly upturned eyes'],
]

const NOSE_MOUTH: readonly Option[] = [
  ['low_nose', 2, 'a low nose bridge'], ['high_nose', 2, 'a high nose bridge'], ['wide_nose', 2, 'a wide nose'], ['thin_lips', 2, 'thin lips'],
  ['full_lips', 2, 'full lips'], ['snaggle', 0.6, 'one slightly crooked tooth showing'], ['braces', 0.4, 'braces on the teeth'], ['plain', 4, 'unremarkable nose and lips'],
]

const EYEBROWS: readonly Option[] = [
  ['thick', 3, 'thick eyebrows'], ['thin', 2, 'thin eyebrows'], ['straight', 3, 'straight eyebrows'], ['arched', 2, 'arched eyebrows'],
]

/** Most people look ordinary; a feed where everyone looks like a model reads as fake. */
const ATTRACTIVENESS: readonly Option[] = [
  ['ordinary', 60, 'an ordinary, average-looking person'],
  ['pleasant', 25, 'a pleasant-looking person, not model-like'],
  ['striking', 15, 'a good-looking person, still clearly an ordinary non-professional'],
]

const HAIR_LENGTH: Record<'female' | 'male', readonly Option[]> = {
  female: [['short', 1, 'short'], ['bob', 2.5, 'chin-length bob'], ['medium', 3.5, 'shoulder-length'], ['long', 4, 'long'], ['very_long', 1, 'very long']],
  male: [['buzz', 1.5, 'buzz-cut'], ['short', 5, 'short'], ['medium', 2.5, 'medium-length'], ['long', 0.7, 'long'], ['thinning', 0.5, 'thinning']],
}

const HAIR_STYLE: Record<'female' | 'male', readonly Option[]> = {
  female: [
    ['straight', 4, 'straight hair worn down'], ['wavy', 3, 'loosely waved hair'], ['curly', 1.5, 'curly hair'], ['ponytail', 2.5, 'hair in a ponytail'],
    ['bun', 2, 'hair in a messy bun'], ['braid', 1, 'hair in a braid'], ['half_up', 1.5, 'hair half tied up'], ['bangs', 2.5, 'hair with a fringe'],
  ],
  male: [
    ['neat', 3, 'neatly cut hair'], ['messy', 3, 'slightly messy hair'], ['side_part', 2.5, 'side-parted hair'], ['fringe', 2.5, 'hair with a fringe over the forehead'],
    ['wavy', 1.5, 'wavy hair'], ['curly', 1, 'curly hair'], ['slicked', 1, 'hair pushed back'], ['tied', 0.5, 'hair tied back'],
  ],
}

const FACIAL_HAIR: readonly Option[] = [
  ['none', 6, 'clean-shaven'], ['stubble', 2, 'light stubble'], ['mustache', 0.6, 'a mustache'], ['beard', 1, 'a short beard'], ['full_beard', 0.4, 'a full beard'],
]

const MAKEUP: readonly Option[] = [
  ['none', 3, 'no makeup'], ['light', 4, 'light everyday makeup'], ['regular', 2.5, 'regular makeup'], ['bold', 0.7, 'noticeable makeup'],
]

const ACCESSORIES: readonly Option[] = [
  ['none', 10, ''], ['horn_glasses', 2, 'thick-framed glasses'], ['metal_glasses', 2, 'thin metal-framed glasses'], ['earrings', 1.5, 'small earrings'],
  ['necklace', 1, 'a thin necklace'], ['cap', 1.5, 'a baseball cap'], ['beanie', 1, 'a beanie'], ['bucket_hat', 0.7, 'a bucket hat'],
  ['headphones', 1, 'headphones around the neck'], ['piercing', 0.4, 'an ear piercing'], ['hairband', 0.5, 'a hairband'],
]

const BUILD: Record<'female' | 'male', readonly Option[]> = {
  female: [
    ['slim', 3, 'a slim build'], ['petite', 2, 'a petite, slight build'], ['average', 4, 'an average build'], ['toned', 2, 'a toned, athletic build'],
    ['curvy', 2, 'a curvy build'], ['strong_legs', 1, 'strong legs'], ['plump', 1.5, 'a soft, plump build'],
  ],
  male: [
    ['skinny', 1.5, 'a skinny build'], ['slim', 3, 'a slim build'], ['average', 4, 'an average build'], ['broad', 2, 'broad shoulders'],
    ['gym', 2, 'a gym-trained, muscular build'], ['belly', 1.5, 'a bit of a belly'], ['large', 1, 'a large, heavy build'],
  ],
}

const HEIGHT: readonly Option[] = [['short', 2, 'on the short side'], ['average', 5, 'of average height'], ['tall', 2, 'on the tall side']]
const POSTURE: readonly Option[] = [['upright', 3, 'standing upright'], ['slouch', 2, 'slouching a little'], ['lean', 2, 'weight on one leg'], ['relaxed', 3, 'in a relaxed stance']]

const EXPRESSIONS: readonly Option[] = [
  ['neutral', 3, 'a neutral expression'], ['slight_smile', 4, 'a slight smile'], ['big_smile', 2.5, 'a wide smile'], ['playful', 1.5, 'a playful expression'],
  ['sleepy', 1, 'a sleepy look'], ['serious', 1.5, 'a serious look'], ['eyes_closed', 0.7, 'eyes closed, smiling'], ['eating', 0.5, 'mid-bite, eating'],
]

const HAND_POSES: readonly Option[] = [
  ['none', 8, ''], ['peace', 2, 'making a peace sign'], ['chin', 1.5, 'chin resting on a hand'], ['cheek', 0.7, 'a finger pressed to the cheek'],
  ['hair', 1, 'a hand in the hair'], ['cup', 1.5, 'holding a cup'], ['pocket', 1, 'a hand in a pocket'], ['arms_crossed', 0.6, 'arms crossed'],
]

const OUTFITS: Record<'everyday' | 'fitted' | 'sport', readonly Option[]> = {
  everyday: [
    ['tshirt', 4, 'a plain T-shirt'], ['hoodie', 3, 'a hoodie'], ['sweatshirt', 2.5, 'a sweatshirt'], ['shirt', 2.5, 'a casual button-up shirt'],
    ['knit', 2.5, 'a knit sweater'], ['coat', 1.5, 'a coat'], ['blazer', 1, 'a blazer'], ['dress', 1.5, 'a simple dress'], ['denim_jacket', 1.5, 'a denim jacket'],
    ['puffer', 1, 'a padded jacket'], ['scarf', 0.7, 'a sweater with a scarf'], ['suit', 0.7, 'office clothes with a lanyard'], ['uniform', 0.4, 'a work uniform'],
    ['oversized', 1.5, 'oversized streetwear'], ['vintage', 0.8, 'vintage-style clothes'], ['all_black', 1, 'all-black clothes'], ['band_tee', 0.7, 'a faded band T-shirt with no readable text'],
    ['pajamas', 0.6, 'comfortable home clothes'], ['sleeveless', 0.8, 'a sleeveless top'], ['traditional', 0.4, 'the traditional dress of their country'],
  ],
  fitted: [
    ['jeans_tee', 3, 'a tucked-in T-shirt and jeans'], ['slim_knit', 2, 'a fitted knit top and trousers'], ['crop', 1.5, 'a cropped top and high-waisted trousers'],
    ['leggings', 1.5, 'leggings and a loose top'], ['fitted_dress', 1.5, 'a fitted everyday dress'], ['slacks_shirt', 2, 'a shirt and slacks'],
    ['shorts_tee', 1.5, 'shorts and a T-shirt'], ['oversized', 2, 'an oversized top and wide trousers'], ['coat_layer', 1, 'a long coat over a simple outfit'],
  ],
  sport: [
    ['gym', 4, 'gym clothes'], ['running', 2.5, 'running clothes'], ['yoga', 1.5, 'yoga clothes'], ['hiking', 1.5, 'hiking clothes'],
    ['kit', 1.5, 'a plain sports kit with no logo'], ['rashguard', 1, 'a rash guard and board shorts'],
  ],
}

/** Outfit keys only picked for a woman. */
const FEMALE_ONLY_OUTFITS = new Set(['dress', 'fitted_dress', 'crop', 'leggings'])

function outfitsFor(options: readonly Option[], gender: 'female' | 'male' | null): readonly Option[] {
  return gender === 'female' ? options : options.filter((option) => !FEMALE_ONLY_OUTFITS.has(option[0]))
}

// ─── 4. How it was shot, and where ───────────────────────────────────────────

const SHOOTERS: readonly Option[] = [
  ['selfie', 5, 'a front-camera selfie held at arm\'s length'], ['friend', 4, 'taken by a friend standing a few steps away'],
  ['candid', 2.5, 'a candid shot, the subject not posing'], ['timer', 1, 'taken with a timer, the phone propped on something'],
  ['group_crop', 1, 'cropped out of a group photo, part of someone else\'s shoulder at the edge'],
]

const DISTANCES: readonly Option[] = [
  ['closeup', 3, 'a close-up of the face'], ['shoulders', 4, 'framed from the shoulders up'], ['chest', 3, 'framed from the chest up'],
  ['waist', 2.5, 'framed from the waist up'], ['full', 1.5, 'a full-body shot, the face small in the frame'],
]

const COMPOSITIONS: readonly Option[] = [
  ['centered', 4, 'subject centered'], ['off_center', 3, 'subject off to one side'], ['tilted', 1.5, 'the frame slightly tilted'], ['cut_off', 1.5, 'the top of the head cut off by the frame'],
]

const QUALITIES: readonly Option[] = [
  ['new_phone', 5, 'shot on a recent smartphone'], ['old_phone', 2.5, 'shot on an older smartphone, slightly noisy and soft'],
  ['front_cam', 2, 'front-camera wide-angle distortion'], ['film', 1.5, 'the look of a cheap film camera, grainy with muted colors'],
  ['instant', 0.7, 'the look of an instant-film print'], ['photo_booth', 0.7, 'the look of a photo-booth strip frame, plain backdrop'],
  ['dslr', 1, 'shot on a camera with a softly blurred background'], ['id_photo', 0.3, 'the look of an ID photo against a plain backdrop'],
]

const FILTERS: readonly Option[] = [
  ['none', 6, 'no filter'], ['beauty', 1.5, 'a mild smoothing beauty filter'], ['warm', 1.5, 'a warm color filter'], ['cool', 1, 'a cool, slightly faded color filter'],
  ['bw', 0.8, 'black and white'], ['vintage', 0.8, 'a faded vintage filter'],
]

const LIGHTING: readonly Option[] = [
  ['daylight', 5, 'ordinary daylight'], ['window', 3, 'soft light from a window'], ['golden', 2, 'low evening sun'], ['fluorescent', 2, 'flat indoor fluorescent light'],
  ['warm_lamp', 2, 'warm indoor lamp light'], ['flash', 1, 'direct phone flash in a dark place'], ['neon', 0.8, 'colored neon light at night'],
  ['overcast', 1.5, 'grey overcast light'], ['screen', 0.4, 'lit only by a screen in a dark room'],
]

const FLAWS: readonly Option[] = [
  ['none', 5, ''], ['soft_focus', 2, 'focus slightly missed'], ['slight_blur', 1.5, 'a little motion blur'], ['overexposed', 1, 'slightly overexposed highlights'],
  ['mirror_smudge', 1, 'smudges on the mirror or lens'], ['clutter', 2, 'everyday clutter visible in the background'], ['finger', 0.3, 'a fingertip at the edge of the frame'],
]

type ShotEnv = 'indoor' | 'outdoor' | 'any'
const INDOOR_ONLY_LIGHT = new Set(['window', 'fluorescent', 'warm_lamp', 'screen'])
const OUTDOOR_ONLY_LIGHT = new Set(['golden', 'overcast', 'neon'])

function lightingFor(env: ShotEnv): readonly Option[] {
  if (env === 'indoor') return LIGHTING.filter((option) => !OUTDOOR_ONLY_LIGHT.has(option[0]))
  if (env === 'outdoor') return LIGHTING.filter((option) => !INDOOR_ONLY_LIGHT.has(option[0]))
  return LIGHTING
}

/** Mirror smudges only make sense in a mirror shot. */
function flawsFor(mirror: boolean): readonly Option[] {
  return mirror ? FLAWS : FLAWS.filter((option) => option[0] !== 'mirror_smudge')
}

const LOCATIONS: Record<'indoor' | 'outdoor' | 'mirror', readonly Option[]> = {
  indoor: [
    ['bedroom', 4, 'in their bedroom'], ['living_room', 2, 'in a living room'], ['desk', 2, 'at a desk at home'], ['cafe', 4, 'in a café'],
    ['restaurant', 2, 'in a casual restaurant'], ['bar', 1, 'in a dim bar'], ['office', 1.5, 'in an office'], ['classroom', 1, 'in a classroom'],
    ['library', 0.8, 'in a library'], ['car', 1.5, 'in the driver\'s or passenger seat of a car'], ['subway', 1, 'on a train or subway'], ['white_wall', 1.5, 'against a plain wall'],
  ],
  outdoor: [
    ['street', 4, 'on an ordinary street of their city'], ['alley', 2, 'in a narrow side street'], ['park', 3, 'in a park'], ['riverside', 1.5, 'by a river'],
    ['beach', 2, 'on a beach'], ['mountain', 1.5, 'on a mountain trail'], ['rooftop', 1, 'on a rooftop'], ['market', 1, 'at a street market'],
    ['campus', 1, 'on a university campus'], ['night_street', 1.5, 'on a city street at night'], ['flower_field', 0.8, 'near flowering trees or a flower field'],
    ['travel_city', 1.5, 'on a street in a foreign city, as a tourist'], ['festival', 0.6, 'at an outdoor festival'], ['stadium', 0.5, 'in stadium stands'],
  ],
  mirror: [
    ['hall_mirror', 3, 'in the hallway mirror at home'], ['bedroom_mirror', 3, 'in a bedroom mirror'], ['bathroom_mirror', 2, 'in a bathroom mirror'],
    ['elevator', 2, 'in an elevator mirror'], ['shop_mirror', 1.5, 'in a clothing-shop mirror'], ['gym_mirror', 1.5, 'in a gym mirror'],
  ],
}

const ANIMAL_SHOTS: readonly Option[] = [
  ['face', 4, 'a close-up of its face looking at the camera'], ['sleeping', 3, 'asleep, curled up'], ['held', 2, 'held in a person\'s arms, only the hands and arms visible'],
  ['walk', 1.5, 'outdoors on a walk'], ['sofa', 2, 'lying on a sofa or bed'], ['window', 1, 'sitting by a window'],
]

const ANIMAL_LOOKS: Record<string, readonly Option[]> = {
  dog: [
    ['small_mix', 3, 'a small mixed-breed'], ['poodle', 2, 'a toy poodle'], ['maltese', 1.5, 'a white Maltese'], ['shiba', 1.5, 'a Shiba Inu'], ['corgi', 1, 'a corgi'],
    ['retriever', 1.5, 'a golden retriever'], ['medium_mix', 2.5, 'a medium brown mixed-breed'], ['pomeranian', 1, 'a Pomeranian'],
  ],
  cat: [
    ['tabby', 3, 'a grey tabby'], ['orange', 2.5, 'an orange tabby'], ['tuxedo', 2, 'a black-and-white tuxedo cat'], ['black', 1.5, 'a black cat'],
    ['white', 1, 'a white cat'], ['calico', 1.5, 'a calico'], ['longhair', 1, 'a long-haired cat'],
  ],
}

// ─── 5. Picking a spec ───────────────────────────────────────────────────────

function categoryWeights(persona: AvatarPersona): Array<{ key: AvatarCategory; weight: number }> {
  const country = (persona.country ?? '').toUpperCase()
  const factors = FACE_SHY_COUNTRIES.has(country)
    ? CATEGORY_COUNTRY_FACTORS.shy
    : FACE_FORWARD_COUNTRIES.has(country) ? CATEGORY_COUNTRY_FACTORS.forward : {}
  const bio = persona.bio ?? ''
  return AVATAR_CATEGORIES.map(({ key, weight }) => {
    let next = weight * (factors[key] ?? 1)
    for (const hint of BIO_HINTS) {
      if (hint.category === key && hint.pattern.test(bio)) next *= hint.factor
    }
    return { key, weight: next }
  })
}

function pickCategory(persona: AvatarPersona, random: Random): AvatarCategory {
  const weights = categoryWeights(persona)
  return pick(weights.map(({ key, weight }) => [key, weight, ''] as const), random)[0] as AvatarCategory
}

function pickSubtype(category: AvatarCategory, persona: AvatarPersona, random: Random): Subtype {
  const bio = persona.bio ?? ''
  const options = AVATAR_SUBTYPES[category].map((subtype) => {
    const boosted = BIO_HINTS.some((hint) => hint.category === category && hint.subtype === subtype.key && hint.pattern.test(bio))
    return [subtype.key, subtype.weight * (boosted ? 6 : 1), ''] as const
  })
  const key = pick(options, random)[0]
  return AVATAR_SUBTYPES[category].find((subtype) => subtype.key === key) ?? AVATAR_SUBTYPES[category][0]
}

function genderOf(persona: AvatarPersona): 'female' | 'male' | null {
  return persona.gender === 'female' || persona.gender === 'male' ? persona.gender : null
}

function ageBand(age: number | null, gender: 'female' | 'male' | null = null): string {
  const their = gender === 'female' ? 'her' : gender === 'male' ? 'his' : 'their'
  if (age === null) return `in ${their} late twenties`
  if (age < 25) return `in ${their} early twenties`
  if (age < 30) return `in ${their} late twenties`
  if (age < 35) return `in ${their} early thirties`
  if (age < 45) return 'around forty'
  if (age < 60) return 'around fifty'
  return `in ${their} sixties`
}

type Picker = (axis: string, options: readonly Option[]) => string

/** Who the person is, as far as this kind of photo shows them. */
function describePerson(persona: AvatarPersona, show: { face: boolean; body: boolean; hair: boolean }, take: Picker, random: Random): string {
  const gender = genderOf(persona)
  // Unknown gender: the picker still needs one table; the prompt lets the name decide.
  const table = gender ?? (random() < 0.5 ? 'female' : 'male')
  const people = COUNTRY_PEOPLE[(persona.country ?? '').toUpperCase()]
  const person = people
    ? pick(people.map(([label, ancestry, weight]) => [ancestry, weight, label] as const), random)
    : (['mixed', 1, persona.countryName ? `person from ${persona.countryName}` : 'person'] as const)
  const ancestry = person[0] as AncestryKey
  const noun = gender === 'female' ? 'woman' : gender === 'male' ? 'man' : `person whose gender fits the given name "${persona.name ?? ''}"`

  const parts: string[] = [`a ${person[2]} ${noun} ${ageBand(persona.age, gender)}`, take('attractiveness', ATTRACTIVENESS), take('skin', SKIN_TONES[ancestry])]
  if (show.hair) {
    const young = persona.age === null || persona.age < 35
    const dyed = young && random() < 0.18
    const color = take('hairColor', dyed ? DYED_HAIR : NATURAL_HAIR[ancestry])
    parts.push(`${take('hairLength', HAIR_LENGTH[table])} ${color} hair, ${take('hairStyle', HAIR_STYLE[table])}`)
  }
  if (show.face) {
    parts.push(take('faceShape', FACE_SHAPES), take('eyes', EYES), take('eyebrows', EYEBROWS), take('noseMouth', NOSE_MOUTH), take('skinFeature', SKIN_FEATURES))
    if (gender === 'male') parts.push(take('facialHair', FACIAL_HAIR))
    if (gender === 'female') parts.push(take('makeup', MAKEUP))
    parts.push(take('accessory', ACCESSORIES))
  }
  if (show.body) parts.push(take('build', BUILD[table]), take('height', HEIGHT))
  return parts.filter(Boolean).join(', ')
}

const RULES = [
  'It must look like a real, unedited photo from an ordinary person\'s phone gallery: not a studio, stock or advertising photo, no perfect symmetry, no glossy retouched skin.',
  'Square 1:1 image. No text, captions, watermarks, logos, brand names, borders or frames anywhere in the image.',
  'Any person shown is an adult, fully and ordinarily dressed. Not a real, identifiable or famous person, and no existing character.',
].join(' ')

/**
 * Picks one photo spec for the persona. `random` decides everything that is
 * not fixed by the account (gender, age, country and city are), so a new
 * `random` gives the same account a different photo.
 */
export function pickAvatarSpec(persona: AvatarPersona, random: Random = Math.random): AvatarSpec {
  const category = pickCategory(persona, random)
  const subtype = pickSubtype(category, persona, random)
  const attributes: Record<string, string> = {}
  const take: Picker = (axis, options) => {
    const option = pick(options, random)
    attributes[axis] = option[0]
    return option[2]
  }
  const place = [persona.city, persona.countryName].filter(Boolean).join(', ') || 'their home city'
  const gender = genderOf(persona)
  let env: ShotEnv = 'any'
  let mirrorShot = false
  /** Picks a place and remembers whether it is indoors, so the light matches it. */
  const takeLocation = (kind: 'indoor' | 'outdoor' | 'mirror') => {
    env = kind === 'outdoor' ? 'outdoor' : 'indoor'
    mirrorShot = kind === 'mirror'
    return take('location', LOCATIONS[kind])
  }
  const shot = () => [
    take('quality', mirrorShot ? QUALITIES.filter((option) => option[0] !== 'front_cam') : QUALITIES),
    take('lighting', lightingFor(env)),
    take('filter', FILTERS),
    take('flaw', flawsFor(mirrorShot)),
  ].filter(Boolean).join('; ')
  const lines: string[] = ['A casual photo that someone uses as their social media profile picture.']

  if (category === 'face' || category === 'partial') {
    const mirror = subtype.key === 'mirror_phone'
    lines.push(`Subject: ${describePerson(persona, { face: true, body: false, hair: true }, take, random)}.`)
    lines.push(`Framing: ${subtype.text}; ${mirror ? 'a mirror selfie' : take('shooter', SHOOTERS)}; ${take('distance', DISTANCES)}; ${take('composition', COMPOSITIONS)}.`)
    lines.push(`Expression and pose: ${[take('expression', EXPRESSIONS), take('handPose', HAND_POSES)].filter(Boolean).join(', ')}.`)
    lines.push(`Wearing ${take('outfit', outfitsFor(OUTFITS.everyday, gender))}.`)
    lines.push(`Setting: ${takeLocation(mirror ? 'mirror' : random() < 0.55 ? 'indoor' : 'outdoor')}, consistent with ${place}.`)
  } else if (category === 'back') {
    lines.push(`Subject: ${describePerson(persona, { face: false, body: true, hair: true }, take, random)}. The face is not visible at all.`)
    lines.push(`Framing: ${subtype.text}; ${take('posture', POSTURE)}; taken by a friend from behind.`)
    lines.push(`Wearing ${take('outfit', outfitsFor(OUTFITS.everyday, gender))}.`)
    lines.push(`Setting: consistent with ${subtype.key === 'travel_landmark' ? 'a trip abroad' : place}.`)
    env = ['window_gaze', 'concert'].includes(subtype.key) ? 'indoor' : 'outdoor'
  } else if (category === 'body') {
    const sport = ['gym_mirror', 'after_run', 'yoga', 'hiking', 'sports_kit', 'beach_rashguard'].includes(subtype.key)
    const mirror = ['mirror_neck_down', 'mirror_phone_up'].includes(subtype.key)
    lines.push(`Subject: ${describePerson(persona, { face: false, body: true, hair: false }, take, random)}. The face is not visible: it is out of frame, turned away or hidden.`)
    lines.push(`Framing: ${subtype.text}; ${take('posture', POSTURE)}.`)
    if (subtype.key !== 'silhouette' && subtype.key !== 'shadow') lines.push(`Wearing ${take('outfit', outfitsFor(sport ? OUTFITS.sport : OUTFITS.fitted, gender))}. The photo shows the outfit and the person's build in a natural, non-suggestive way.`)
    if (mirror) lines.push(`Setting: ${takeLocation('mirror')}.`)
    else if (['elevator_mirror', 'fitting_room', 'gym_mirror'].includes(subtype.key)) {
      env = 'indoor'
      mirrorShot = true
    } else if (subtype.key === 'yoga') env = 'indoor'
    else if (sport || subtype.key === 'silhouette' || subtype.key === 'shadow') env = 'outdoor'
    else lines.push(`Setting: ${takeLocation(random() < 0.4 ? 'indoor' : 'outdoor')}, consistent with ${place}.`)
  } else if (category === 'group') {
    const hidden = subtype.key === 'friends_back'
    lines.push(`Account owner: ${describePerson(persona, { face: !hidden, body: false, hair: true }, take, random)}.`)
    lines.push(`Framing: ${subtype.text}. The others are ordinary adults of a similar age and background, each looking different from the account owner.`)
    if (!hidden) lines.push(`Expression: ${take('expression', EXPRESSIONS)}.`)
    lines.push(`Wearing ${take('outfit', outfitsFor(OUTFITS.everyday, gender))}.`)
    lines.push(`Setting: consistent with ${subtype.key === 'trip_group' ? 'a trip' : place}.`)
    env = subtype.key === 'table_group' ? 'indoor' : ['trip_group', 'friends_back', 'team'].includes(subtype.key) ? 'outdoor' : 'any'
  } else if (category === 'part') {
    lines.push(`Subject: ${subtype.text}, belonging to a ${gender === 'female' ? 'woman' : gender === 'male' ? 'man' : 'person'} ${ageBand(persona.age, gender)}. Only this part of the body is in the frame.`)
    lines.push(`Setting: an everyday place consistent with ${place}.`)
  } else if (category === 'object') {
    lines.push(`Subject: ${subtype.text}. No people in the frame except possibly a hand.`)
    lines.push(`Setting: an everyday place consistent with ${place} (${persona.countryName ?? 'the persona\'s country'}).`)
  } else if (category === 'animal') {
    const looks = ANIMAL_LOOKS[subtype.key]
    lines.push(`Subject: ${looks ? take('animalLook', looks) : subtype.text}${looks ? ` (${subtype.text})` : ''}; ${take('animalShot', ANIMAL_SHOTS)}.`)
    lines.push('Setting: an ordinary home or neighborhood. No human face in the frame.')
  } else if (category === 'scenery') {
    lines.push(`Subject: ${subtype.text}, as seen in or near ${place}. No people as the subject.`)
    env = 'outdoor'
  } else {
    lines.push(`Subject: ${subtype.text}. No photographic person in the image.`)
  }

  if (category !== 'other') lines.push(`Camera and light: ${shot()}.`)
  lines.push(RULES)

  const categoryKo = AVATAR_CATEGORIES.find((entry) => entry.key === category)?.ko ?? category
  return {
    version: AVATAR_SPEC_VERSION,
    category,
    subtype: subtype.key,
    labelKo: `${categoryKo} · ${subtype.ko}`,
    attributes,
    prompt: lines.join('\n'),
  }
}

/** A small seeded PRNG (mulberry32), so one account + attempt always picks the same spec. */
export function seededRandom(seed: string): Random {
  let state = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
