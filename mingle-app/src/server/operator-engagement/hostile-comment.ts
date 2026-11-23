import { SchemaType, type ResponseSchema } from '@google/generative-ai'
import { generateJson, OPERATOR_TEXT_MODEL } from '@/server/llm/generate-json'

/**
 * Whether a real person's comment is hostile, so an operator never likes it
 * (staff, 2026-11-23: a Vietnamese operator account liked
 * "我还讨厌你们越南人呢…", a comment attacking Vietnamese people). Claude Haiku
 * 5.5, one short call per comment, remembered in this process so a comment
 * is judged once per deploy. A failed call counts as hostile: a like that is
 * not given never hurts, a like on an insult does.
 */
const CALL_TIMEOUT_MS = 20_000
const CACHE_MAX_ENTRIES = 5000
const verdicts = new Map<string, boolean>()

const INSTRUCTIONS = [
  'You judge one comment a person left on a social app post (any language).',
  'hostile = true when the comment insults, mocks, belittles or attacks the post\'s author or a group (nationality, race, gender, religion, looks), is hateful, harassing, sexually crude, threatening, or plainly trolling.',
  'hostile = false for friendly, neutral or curious comments, honest questions, light teasing between friends, and disagreement said without contempt.',
  'Answer with JSON: {"hostile": true|false}.',
].join('\n')

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: { hostile: { type: SchemaType.BOOLEAN } },
  required: ['hostile'],
}

type Judge = (request: Parameters<typeof generateJson<boolean>>[0]) => Promise<boolean>

export async function isHostileComment(commentId: string, text: string | null, judge: Judge = generateJson<boolean>): Promise<boolean> {
  const cached = verdicts.get(commentId)
  if (cached !== undefined) return cached
  const body = (text ?? '').trim()
  if (!body) return false
  let hostile: boolean
  try {
    hostile = await judge({
      instructions: INSTRUCTIONS,
      input: { comment: body.slice(0, 1000) },
      responseSchema: RESPONSE_SCHEMA,
      validate: (value) => {
        const verdict = (value as { hostile?: unknown } | null)?.hostile
        if (typeof verdict !== 'boolean') throw new Error('invalid')
        return verdict
      },
      model: OPERATOR_TEXT_MODEL,
      provider: 'direct',
      maxOutputTokens: 64,
      timeoutMs: CALL_TIMEOUT_MS,
    })
  } catch (error) {
    console.warn('[operator-engagement] hostile_check_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return true
  }
  verdicts.set(commentId, hostile)
  while (verdicts.size > CACHE_MAX_ENTRIES) {
    const oldest = verdicts.keys().next().value
    if (oldest === undefined) break
    verdicts.delete(oldest)
  }
  return hostile
}

/** Tests only. */
export function clearHostileVerdicts(): void {
  verdicts.clear()
}
