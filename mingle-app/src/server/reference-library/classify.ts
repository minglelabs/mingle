import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { OPERATOR_TEXT_MODEL } from '@/server/llm/generate-json'
import { isReferenceKind, referenceKindHasGender, type ReferenceGender, type ReferenceKind } from './library'

/**
 * A look at an uploaded reference photo (Claude, text only): what kind it is
 * and, for a person, their apparent gender, so the library uses it where it
 * fits. Null when Claude is not set up or does not answer; staff can set
 * both by hand on the page.
 */
const INSTRUCTIONS = [
  'You sort one photo for a library of reference photos. First count the people who are a subject of the photo (not tiny passers-by far away).',
  'kind: "thing" when nobody is: food, drinks, a place or view, an object, an animal, a screen;',
  '"group" when two or more people are;',
  '"face" when one person is and their face can be seen (even partly: sunglasses, a hand, a phone in a mirror);',
  '"person" when one person is but their face cannot be seen (from behind, turned away, cropped above the face, covered, a silhouette, only the body).',
  'gender: "female" or "male" for that one person when kind is face or person and it is clear; else null.',
  'summary: a detailed description in English (80 to 150 words) so an artist could redraw the photo without seeing it: for each person, apparent age, hairstyle and hair color, outfit and accessories, pose, gesture, expression and where they look (never who they are); the objects, food or animals and how they are arranged; the place and background; the camera angle, distance and framing (selfie, mirror shot, taken by someone else, from above…); the light, colors and time of day; the mood; any visible text or app interface.',
  'Answer with JSON only: {"kind": "...", "gender": "female"|"male"|null, "summary": "..."}',
].join('\n')

/**
 * The automatic look runs only through 2026-12-12 (KST); after that staff tag
 * every photo themselves on upload (staff, 2026-11-24).
 */
export const REFERENCE_AUTO_TAG_UNTIL_MS = Date.parse('2026-12-13T00:00:00+09:00')

export function referenceAutoTagEnabled(now: Date = new Date()): boolean {
  return now.getTime() < REFERENCE_AUTO_TAG_UNTIL_MS
}

export type ReferenceClassification = { kind: ReferenceKind; gender: ReferenceGender | null; summary: string | null }

export function parseClassification(text: string): ReferenceClassification | null {
  const match = /\{[\s\S]*\}/.exec(text)
  if (!match) return null
  try {
    const value = JSON.parse(match[0]) as Record<string, unknown>
    const kind = isReferenceKind(value.kind) ? value.kind : null
    if (!kind) return null
    const gender = referenceKindHasGender(kind) && (value.gender === 'female' || value.gender === 'male') ? value.gender : null
    const summary = typeof value.summary === 'string' && value.summary.trim() ? value.summary.trim().slice(0, 1500) : null
    return { kind, gender, summary }
  } catch {
    return null
  }
}

export async function classifyReferencePhoto(bytes: Buffer, options: { timeoutMs?: number } = {}): Promise<ReferenceClassification | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  try {
    const jpeg = await sharp(bytes).rotate().resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
    const client = new Anthropic({ apiKey, maxRetries: 1 })
    const message = await client.messages.create({
      model: OPERATOR_TEXT_MODEL,
      max_tokens: 700,
      system: INSTRUCTIONS,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
          { type: 'text', text: 'The photo.' },
        ],
      }],
    }, { timeout: options.timeoutMs ?? 30_000 })
    return parseClassification(message.content.map((block) => (block.type === 'text' ? block.text : '')).join(''))
  } catch (error) {
    console.warn('[reference-library] classify_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return null
  }
}
