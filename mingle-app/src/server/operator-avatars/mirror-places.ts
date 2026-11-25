/**
 * Where a mirror selfie is taken, and how it is framed. Staff 2026-11-25:
 * every mirror selfie looked alike (a full-length mirror leaning on a wall in
 * a tidy home, shoes on, head to toe). Real ones are taken anywhere there is a
 * mirror or a reflection, and mostly not head to toe.
 */
export type MirrorOption = readonly [key: string, weight: number, text: string]

export const MIRROR_PLACES: readonly MirrorOption[] = [
  // At home: a few, and not always the leaning full-length one.
  ['home_bathroom', 2, 'in the bathroom mirror above the sink at home, the tap, a toothbrush cup and tiles in view'],
  ['home_hall', 1, 'in the mirror by the front door at home, shoes and an umbrella by the door'],
  ['home_wardrobe', 1, 'in a mirror on a wardrobe door in their room, clothes on a chair beside it'],
  // Public places.
  ['subway_restroom', 1.5, 'in the restroom mirror of a subway station, a long row of sinks and grey tiles, hard ceiling light'],
  ['public_building', 1, 'in a restroom mirror of a public building (a city hall, a library or a community center), plain tiles and a hand dryer'],
  ['cafe_restroom', 1.5, 'in a small café restroom mirror with a framed round mirror, a plant or a candle on the counter'],
  ['bar_restroom', 1, 'in a dim bar or restaurant restroom mirror, warm light, stickers or posters on the wall'],
  ['department_store', 1.5, 'in a mirrored pillar or mirror wall of a department store, shop lights, racks and shoppers behind'],
  ['mall_corridor', 1, 'in a mirror wall of a shopping arcade or an underground mall, shop signs and passers-by behind'],
  ['clothing_shop', 1.5, 'in a clothing shop mirror by the racks, trying something on, price tags and hangers in view'],
  ['fitting_room', 1, 'in a fitting-room mirror behind a half-drawn curtain, a few outfits hung on the hook'],
  ['hotel_room', 1, 'in a hotel room mirror, a made bed, a suitcase and the room lamps behind'],
  ['hotel_lobby', 0.8, 'in a mirror in a hotel lobby or a hotel elevator hall, marble and brass, soft warm light'],
  ['elevator', 1.5, 'in an elevator mirror, the buttons and the steel walls in view'],
  ['gym', 0.8, 'in a gym mirror, machines and other people working out behind'],
  ['dance_studio', 0.5, 'in the mirror wall of a dance or practice studio, a wooden floor and a ballet barre'],
  ['salon', 0.6, 'in a hair-salon mirror right after a cut, the salon chair and products in view'],
  ['karaoke', 0.5, 'in the mirror of a karaoke room or a photo-booth studio, colored lights'],
  // Outdoors: a reflection out in the street.
  ['shop_window', 1.2, 'outdoors in the reflection of a dark shop window or a glass door on the street, the street and the sky behind'],
  ['mirror_facade', 0.8, 'outdoors in a mirrored building wall or a polished steel panel, the city reflected around them'],
  ['street_mirror', 0.5, 'outdoors in a full mirror outside a shop or at a station entrance, people passing by'],
]

/** How much of the person the mirror shows; head to toe is only one way of several. */
export const MIRROR_FRAMINGS: readonly MirrorOption[] = [
  ['waist_up', 3, 'from the waist up, close to the mirror'],
  ['chest_up', 2, 'from the chest up, the phone at chest height'],
  ['knees_up', 2, 'from the knees up, standing a step back from the mirror'],
  ['full', 1.5, 'head to toe, the whole outfit in the mirror'],
  ['angled', 1.5, 'turned a little to the side, the mirror seen at an angle'],
  ['leaning', 1, 'leaning toward the mirror over a counter or a sink'],
  ['sitting', 0.7, 'sitting or crouching in front of the mirror'],
]

function weighted(options: readonly MirrorOption[], random: () => number): MirrorOption {
  let roll = random() * options.reduce((sum, option) => sum + option[1], 0)
  for (const option of options) {
    roll -= option[1]
    if (roll < 0) return option
  }
  return options[options.length - 1]
}

/** One place and framing for a mirror selfie, as a short phrase. */
export function pickMirrorSelfie(random: () => number = Math.random): { place: MirrorOption; framing: MirrorOption; text: string } {
  const place = weighted(MIRROR_PLACES, random)
  const framing = weighted(MIRROR_FRAMINGS, random)
  return { place, framing, text: `${place[2]}, ${framing[2]}` }
}
