import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { OPERATOR_TEXT_MODEL } from '@/server/llm/generate-json'
import type { AvatarReference } from '@/server/operator-avatars/generate'

/**
 * Told only "make it different", the image model still copies the attached
 * photo of the poster: the same head tilt, smile, hand in the hair, glasses
 * and framing (staff, 2026-11-23). So Claude first looks at that photo and
 * names exactly those things, and the prompt asks for each to change. Text
 * only: the drawing itself stays with the ChatGPT pool.
 */
const INSTRUCTIONS = [
  'You look at one photo of a person. List what this photo shows that is NOT part of their face itself, so an artist can draw a new photo of the same person that differs in each point.',
  'One short line per point, in English, in this order and with these labels:',
  'Head angle: / Gaze: / Expression: / Hands and arms: / Body pose: / Camera distance and angle: / Hair styling (parting, tied or loose, bangs): / Accessories (glasses, hat, earrings, mask): / Outfit: / Place and background: / Light and colors:',
  'Be concrete and visual (e.g. "head tilted to her left, chin down", "eyes closed in a big laugh", "right hand pushing hair back", "thin metal glasses"). Write "none" when a point does not apply. No opinions, no description of the facial features themselves, nothing else.',
].join('\n')

const MAX_CACHE = 200
const cache = new Map<string, string>()

/** The list for one photo, or null when Claude is not set up or does not answer. */
export async function describeReferenceForContrast(reference: AvatarReference, options: { timeoutMs?: number } = {}): Promise<string | null> {
  const key = createHash('sha1').update(reference.bytes).digest('hex')
  const cached = cache.get(key)
  if (cached) return cached
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  try {
    const jpeg = await sharp(reference.bytes).rotate().resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    const client = new Anthropic({ apiKey, maxRetries: 1 })
    const message = await client.messages.create({
      model: OPERATOR_TEXT_MODEL,
      max_tokens: 600,
      system: INSTRUCTIONS,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
          { type: 'text', text: 'The photo.' },
        ],
      }],
    }, { timeout: options.timeoutMs ?? 30_000 })
    const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('').trim()
    if (!text || !/Head angle:/i.test(text)) return null
    const lines = text.split('\n').map((line) => line.trim().replace(/^[-*•]\s*/, '')).filter((line) => line && !/:\s*none\.?$/i.test(line)).slice(0, 12)
    const list = lines.join('\n')
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
    cache.set(key, list)
    return list
  } catch (error) {
    console.warn('[operator-post-reserve] reference_contrast_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return null
  }
}

/** The prompt lines that ask the new photo to differ from the attached one, point by point. */
export function contrastLines(list: string): string[] {
  return [
    'What the attached photo of the poster shows besides the face (from a careful look at it):',
    list,
    'The new photo must differ from the attached one in EVERY point of that list: another head angle, gaze, expression, hand and arm position, pose, camera distance and angle, hair styling, outfit, place and light. Accessories in that list (glasses, a hat, earrings) are left off unless the description above asks for them. Only where the description above explicitly asks for something (for example a hand raised to the head) does the description win.',
  ]
}
