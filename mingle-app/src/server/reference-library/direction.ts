import type { AvatarPersona } from '@/server/operator-avatars/taxonomy'
import type { ReferenceAttributes, ReferencePersonAttributes } from './classify'

/**
 * A library photo's direction (연출), read from its analysis, as the lines an
 * image prompt follows: how it was shot (who held the phone, distance, angle,
 * framing, shake and focus, exposure, grain, filter, phone), its light, time
 * and weather, and the pose, expression and gaze. These carry over exactly;
 * the person, their style and the place's details come from the account's own
 * persona instead (staff, 2026-11-24: the shot's direction is what a reference
 * is for, played by the account's persona, not a look-alike of the photo).
 */

const SHOOTER: Record<string, string> = {
  selfie: 'a front-camera selfie at arm\'s length',
  mirror_selfie: 'a mirror selfie, the phone visible in the mirror',
  friend: 'taken by a friend standing in front of them',
  candid: 'a candid shot by a friend, the person not posing for it',
  timer: 'a timer shot from a phone set down nearby',
  group_crop: 'cropped out of a group photo',
  photo_booth: 'a photo-booth shot',
}
const DISTANCE: Record<string, string> = {
  extreme_closeup: 'extreme close-up', closeup: 'close-up of the face', shoulders: 'head and shoulders',
  chest: 'from the chest up', waist: 'from the waist up', knees: 'from the knees up', full: 'full body', far: 'far away, small in the frame',
}
const ANGLE: Record<string, string> = {
  eye_level: 'eye level', high: 'from slightly above', low: 'from below', overhead: 'straight down from above', side: 'from the side', from_behind: 'from behind',
}
const COMPOSITION: Record<string, string> = {
  centered: 'subject centered', off_center: 'subject off center', tilted: 'the frame tilted', cut_off: 'the subject partly cut off by the frame edge',
}
const SHARPNESS: Record<string, string> = {
  sharp: 'sharp', slight_shake: 'slightly blurred from hand shake', motion_blur: 'with motion blur (the phone or the subject moved)', out_of_focus: 'out of focus, soft overall',
}
const FOCUS: Record<string, string> = {
  all_sharp: 'everything in focus', subject_only: 'the subject in focus and the background soft', missed: 'the focus landed on the wrong spot',
}
const EXPOSURE: Record<string, string> = {
  dark: 'underexposed, darker than ideal', normal: 'normal exposure', bright: 'bright, slightly overexposed', blown_out: 'highlights blown out to white',
}
const GRAIN: Record<string, string> = {
  clean: 'clean, little noise', slight_noise: 'some phone noise', heavy_noise: 'heavy grainy noise as in low light',
}
const FILTER: Record<string, string> = {
  none: 'no filter', bw: 'black and white', warm: 'a warm filter', cool: 'a cool filter', faded: 'a faded, washed-out filter', vivid: 'boosted vivid colors', film: 'a film-camera look',
}
const QUALITY: Record<string, string> = {
  new_phone: 'a recent phone camera', old_phone: 'an older phone camera, softer and noisier', front_cam: 'a front camera', camera: 'a real camera', film: 'a film camera',
}
const LIGHTING: Record<string, string> = {
  daylight: 'daylight', window: 'window light', golden: 'golden-hour sun', fluorescent: 'fluorescent ceiling light', warm_lamp: 'warm lamp light',
  night: 'night street light', neon: 'neon light', overcast: 'soft overcast light', screen: 'the glow of a screen', flash: 'the phone flash', side_sun: 'hard sun from the side', backlit_shade: 'backlit, the person in shade',
}

function phrase(map: Record<string, string>, value: string | undefined): string | null {
  return value ? map[value] ?? null : null
}

function join(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(', ')
}

function personDirection(person: ReferencePersonAttributes | undefined): string | null {
  if (!person) return null
  const line = join([
    person.pose ? `pose: ${person.pose}` : null,
    person.expression ? `expression: ${person.expression}` : null,
    person.gaze ? `gaze: ${person.gaze}` : null,
  ])
  return line || null
}

/** The direction lines for a library photo; empty when it has no analysis. */
export function referenceDirectionLines(attributes: ReferenceAttributes | null | undefined): string[] {
  if (!attributes) return []
  const a = attributes
  const shot = join([
    phrase(SHOOTER, a.shooter),
    phrase(DISTANCE, a.distance),
    phrase(ANGLE, a.angle),
    phrase(COMPOSITION, a.composition),
    a.orientation ? `${a.orientation} frame` : null,
  ])
  const camera = join([
    phrase(SHARPNESS, a.sharpness),
    phrase(FOCUS, a.focus),
    phrase(EXPOSURE, a.exposure),
    phrase(GRAIN, a.grain),
    phrase(FILTER, a.filter),
    a.quality ? `as from ${QUALITY[a.quality] ?? a.quality}` : null,
  ])
  const light = join([
    phrase(LIGHTING, a.lighting),
    a.timeOfDay && a.timeOfDay !== 'unknown' ? a.timeOfDay.replace('_', ' ') : null,
    a.weather && a.weather !== 'unknown' && a.weather !== 'indoor' ? a.weather : null,
    a.season && a.season !== 'unknown' ? a.season : null,
  ])
  const people = (a.people ?? []).map(personDirection).filter((line): line is string => Boolean(line))
  const layout = a.layout && a.layout !== 'single' && a.panels && a.panels > 1
    ? `Layout: a ${a.layout === 'photo_booth' ? 'photo-booth strip' : 'collage'} of ${a.panels} panels${a.appearances ? ` showing ${a.appearances} figures in all` : ''}, laid out as in the reference.`
    : null
  const lines = [
    ...(shot ? [`Shot: ${shot}.`] : []),
    ...(camera ? [`Camera look, imperfections included (keep them, do not clean them up): ${camera}.`] : []),
    ...(a.flaws ? [`Other flaws of the shot to keep: ${a.flaws}.`] : []),
    ...(light ? [`Light and time: ${light}.`] : []),
    ...(a.mood ? [`Mood: ${a.mood}.`] : []),
    ...(people.length === 1 ? [`The person's ${people[0]}.`] : people.map((line, index) => `Person ${index + 1}'s ${line}.`)),
    ...(layout ? [layout] : []),
  ]
  return lines.length ? ['Direction of the reference shot, to reproduce exactly:', ...lines.map((line) => `- ${line}`)] : []
}

/** Who the account is, for the lines that make the reference shot this persona's own. */
export function referencePersonaLine(persona: AvatarPersona | null | undefined): string | null {
  if (!persona) return null
  const who = join([
    persona.age ? `${persona.age} years old` : null,
    persona.gender === 'female' ? 'a woman' : persona.gender === 'male' ? 'a man' : null,
    [persona.city, persona.countryName].filter(Boolean).join(', ') ? `living in ${[persona.city, persona.countryName].filter(Boolean).join(', ')}` : null,
  ])
  const bio = persona.bio ? `their profile says: "${persona.bio.replace(/\s+/g, ' ').slice(0, 200)}"` : null
  const line = join([who, bio])
  return line ? `This account's persona (the person in the new photo, and whose life it shows): ${line}.` : null
}
