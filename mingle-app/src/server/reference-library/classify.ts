import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { OPERATOR_TEXT_MODEL } from '@/server/llm/generate-json'
import { isReferenceKind, referenceKindHasGender, type ReferenceGender, type ReferenceKind } from './library'

/**
 * A look at an uploaded reference photo (Claude Haiku, text only): its kind
 * and gender, a detailed description, and every axis our photo prompts pick
 * from (taxonomy.ts, photo-realism.ts, post-photo.ts), so a photo can be
 * matched to what a prompt asks for. Values are what the photo appears to
 * show, never who anyone is. Null when Claude is not set up or does not
 * answer; staff can set kind, gender and note by hand on the page.
 */

/**
 * The automatic look runs only through 2026-12-12 (KST); after that staff tag
 * every photo themselves on upload (staff, 2026-11-24).
 */
export const REFERENCE_AUTO_TAG_UNTIL_MS = Date.parse('2026-12-13T00:00:00+09:00')

export function referenceAutoTagEnabled(now: Date = new Date()): boolean {
  return now.getTime() < REFERENCE_AUTO_TAG_UNTIL_MS
}

/** The fixed choices per axis; Claude must answer one of them (else the axis is left out). */
export const REFERENCE_AXES = {
  style: ['photo', 'anime', 'illustration', 'screenshot'],
  layout: ['single', 'photo_booth', 'collage'],
  shooter: ['selfie', 'mirror_selfie', 'friend', 'candid', 'timer', 'group_crop', 'photo_booth', 'no_person'],
  distance: ['extreme_closeup', 'closeup', 'shoulders', 'chest', 'waist', 'knees', 'full', 'far', 'no_person'],
  angle: ['eye_level', 'high', 'low', 'overhead', 'side', 'from_behind'],
  composition: ['centered', 'off_center', 'tilted', 'cut_off'],
  orientation: ['vertical', 'horizontal', 'square'],
  setting: ['indoor', 'outdoor'],
  timeOfDay: ['morning', 'day', 'golden_hour', 'evening', 'night', 'unknown'],
  weather: ['sunny', 'clear', 'cloudy', 'overcast', 'rain', 'snow', 'fog', 'indoor', 'unknown'],
  season: ['spring', 'summer', 'autumn', 'winter', 'unknown'],
  lighting: ['daylight', 'window', 'golden', 'fluorescent', 'warm_lamp', 'night', 'neon', 'overcast', 'screen', 'flash', 'side_sun', 'backlit_shade'],
  filter: ['none', 'bw', 'warm', 'cool', 'faded', 'vivid', 'film'],
  quality: ['new_phone', 'old_phone', 'front_cam', 'camera', 'film'],
} as const

export const REFERENCE_PERSON_AXES = {
  gender: ['female', 'male'],
  age: ['teens', 'early_20s', 'late_20s', '30s', '40s', '50s_plus'],
  ancestry: ['east_asian', 'southeast_asian', 'south_asian', 'white', 'black', 'latino', 'middle_eastern', 'mixed'],
  attractiveness: ['ordinary', 'pleasant', 'striking'],
} as const

type AxisValue<T extends Record<string, readonly string[]>> = { [K in keyof T]?: T[K][number] }

export type ReferencePersonAttributes = AxisValue<typeof REFERENCE_PERSON_AXES> & {
  faceVisible?: boolean
  hair?: string
  outfit?: string
  expression?: string
  pose?: string
  gaze?: string
}

export type ReferenceAttributes = AxisValue<typeof REFERENCE_AXES> & {
  /** Distinct people who are a subject of the photo. */
  peopleCount?: number
  /** Figures shown in all (a photo-booth strip of two friends over four panels shows 8). */
  appearances?: number
  /** Panels of a strip or collage (1 for a single photo). */
  panels?: number
  place?: string
  textOrInterface?: boolean
  people?: ReferencePersonAttributes[]
}

const INSTRUCTIONS = [
  'You tag one photo for a library of reference photos that an image generator will redraw (with new faces). Look carefully and answer with JSON only.',
  'First count the people who are a subject of the photo (not tiny passers-by far away). A photo-booth strip or collage that shows the same person in several panels counts that person once in peopleCount, and every figure in appearances.',
  'kind: "thing" when nobody is a subject (food, drinks, a place or view, an object, an animal, a screen); "group" when two or more people are; "face" when one person is and their face can be seen (even partly: sunglasses, a hand, a phone in a mirror); "person" when one person is but the face cannot be seen (from behind, turned away, cropped, covered, a silhouette).',
  'gender: "female" or "male" for that one person when kind is face or person and it is clear; else null.',
  'summary: a detailed description in English (80 to 150 words) so an artist could redraw the photo without seeing it: each person\'s apparent age, hairstyle and color, outfit and accessories, pose, gesture, expression and gaze; the objects, food or animals and their arrangement; the place and background; camera angle, distance and framing; light, colors, weather and time of day; the mood; any visible text or app interface; and for a strip or collage, how the panels are laid out.',
  'attributes, each one value from its list (leave a key out only when it cannot be told):',
  ...Object.entries(REFERENCE_AXES).map(([key, values]) => `  ${key}: ${values.join(' | ')}`),
  '  peopleCount, appearances, panels: integers',
  '  place: a few words (e.g. "cafe window seat", "subway car", "beach at Haeundae")',
  '  textOrInterface: true when writing, stickers or an app interface show in the photo',
  '  people: one object per distinct person, the most prominent first, at most 4, each with:',
  ...Object.entries(REFERENCE_PERSON_AXES).map(([key, values]) => `    ${key}: ${values.join(' | ')}`),
  '    faceVisible: true | false; hair, outfit, expression, pose, gaze: a few words each',
  '  attractiveness is how the person comes across in the photo for casting a similar-looking stand-in: ordinary (everyday look), pleasant (good-looking), striking (model-like, turns heads). ancestry is the apparent look only.',
  'Never name or guess who anyone is.',
  'Answer: {"kind": "...", "gender": ..., "summary": "...", "attributes": {...}}',
].join('\n')

export type ReferenceClassification = {
  kind: ReferenceKind
  gender: ReferenceGender | null
  summary: string | null
  attributes: ReferenceAttributes | null
}

function pickAxis<T extends readonly string[]>(values: T, value: unknown): T[number] | undefined {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T[number] : undefined
}

function shortText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : undefined
}

function count(value: unknown, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : undefined
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

/** Keeps only known axes with allowed values, so stored attributes are always clean. */
export function parseReferenceAttributes(raw: unknown): ReferenceAttributes | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const axes = Object.fromEntries(
    Object.entries(REFERENCE_AXES).map(([key, values]) => [key, pickAxis(values, value[key])]),
  ) as AxisValue<typeof REFERENCE_AXES>
  const people = Array.isArray(value.people)
    ? value.people.slice(0, 4).flatMap((entry): ReferencePersonAttributes[] => {
        if (!entry || typeof entry !== 'object') return []
        const person = entry as Record<string, unknown>
        return [compact({
          ...Object.fromEntries(Object.entries(REFERENCE_PERSON_AXES).map(([key, values]) => [key, pickAxis(values, person[key])])),
          faceVisible: typeof person.faceVisible === 'boolean' ? person.faceVisible : undefined,
          hair: shortText(person.hair),
          outfit: shortText(person.outfit),
          expression: shortText(person.expression),
          pose: shortText(person.pose),
          gaze: shortText(person.gaze),
        }) as ReferencePersonAttributes]
      })
    : undefined
  const attributes = compact({
    ...axes,
    peopleCount: count(value.peopleCount, 100),
    appearances: count(value.appearances, 200),
    panels: count(value.panels, 24),
    place: shortText(value.place),
    textOrInterface: typeof value.textOrInterface === 'boolean' ? value.textOrInterface : undefined,
    people: people?.length ? people : undefined,
  }) as ReferenceAttributes
  return Object.keys(attributes).length ? attributes : null
}

export function parseClassification(text: string): ReferenceClassification | null {
  const match = /\{[\s\S]*\}/.exec(text)
  if (!match) return null
  try {
    const value = JSON.parse(match[0]) as Record<string, unknown>
    const kind = isReferenceKind(value.kind) ? value.kind : null
    if (!kind) return null
    const gender = referenceKindHasGender(kind) && (value.gender === 'female' || value.gender === 'male') ? value.gender : null
    const summary = typeof value.summary === 'string' && value.summary.trim() ? value.summary.trim().slice(0, 1500) : null
    return { kind, gender, summary, attributes: parseReferenceAttributes(value.attributes) }
  } catch {
    return null
  }
}

export async function classifyReferencePhoto(bytes: Buffer, options: { timeoutMs?: number } = {}): Promise<ReferenceClassification | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  try {
    const jpeg = await sharp(bytes).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    const client = new Anthropic({ apiKey, maxRetries: 1 })
    const message = await client.messages.create({
      model: OPERATOR_TEXT_MODEL,
      max_tokens: 2000,
      system: INSTRUCTIONS,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
          { type: 'text', text: 'The photo.' },
        ],
      }],
    }, { timeout: options.timeoutMs ?? 45_000 })
    return parseClassification(message.content.map((block) => (block.type === 'text' ? block.text : '')).join(''))
  } catch (error) {
    console.warn('[reference-library] classify_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return null
  }
}
