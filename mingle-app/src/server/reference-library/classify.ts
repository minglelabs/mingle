import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { OPERATOR_TEXT_MODEL } from '@/server/llm/generate-json'
import type { ReferenceGender, ReferenceKind } from './library'

/**
 * A look at an uploaded reference photo (Claude, text only): what kind it is
 * and, for a person, their apparent gender, so the library uses it where it
 * fits. Null when Claude is not set up or does not answer; staff can set
 * both by hand on the page.
 */
const INSTRUCTIONS = [
  'You sort one photo for a library of reference photos.',
  'kind: "face" when a person is the subject and their face can be seen (even partly: sunglasses, a hand, a phone in a mirror);',
  '"person" when a person is the subject but their face cannot be seen (from behind, turned away, cropped above the face, covered, a silhouette, only the body);',
  '"thing" when no person is the subject: food, drinks, a place or view, an object, an animal, a screen.',
  'gender: "female" or "male" for the main person when kind is face or person and it is clear; else null.',
  'summary: at most 12 English words on what the photo shows.',
  'Answer with JSON only: {"kind": "...", "gender": "female"|"male"|null, "summary": "..."}',
].join('\n')

export type ReferenceClassification = { kind: ReferenceKind; gender: ReferenceGender | null; summary: string | null }

export function parseClassification(text: string): ReferenceClassification | null {
  const match = /\{[\s\S]*\}/.exec(text)
  if (!match) return null
  try {
    const value = JSON.parse(match[0]) as Record<string, unknown>
    const kind = value.kind === 'face' || value.kind === 'person' || value.kind === 'thing' ? value.kind : null
    if (!kind) return null
    const gender = kind !== 'thing' && (value.gender === 'female' || value.gender === 'male') ? value.gender : null
    const summary = typeof value.summary === 'string' && value.summary.trim() ? value.summary.trim().slice(0, 160) : null
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
      max_tokens: 200,
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
