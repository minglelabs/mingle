import { SchemaType, type ResponseSchema } from '@google/generative-ai'
import { getSttLanguageDisplayName } from '@/lib/stt-languages'
import { generateJson, type GenerateJsonRequest } from '@/server/llm/generate-json'
import { reserveLearnerPlan, reservePosterProfile, resolveReserveModel } from '@/server/operator-post-reserve/generate'
import { hasContactDetails } from '@/server/operators/persona-rules'

/**
 * Writes one comment by an operator account on someone's post. Comments on
 * language-exchange apps are short (about 20 characters at the median): a
 * compliment, an answer to the post's question, an offer to talk, a small
 * joke, or encouragement for a learner. The commenter keeps the voice it
 * posts in (`poster-profile.ts`).
 */
export const OPERATOR_COMMENT_GENERATED_MAX_CHARS = 200
const CALL_TIMEOUT_MS = 60_000

export const COMMENT_KINDS: ReadonlyArray<{ key: string; weight: number; brief: string }> = [
  { key: 'answer', weight: 4, brief: 'answer what the post asks, or add one concrete thing from their own life' },
  { key: 'reaction', weight: 4, brief: 'react in a few words to the specific thing in the post, not a generic compliment' },
  { key: 'offer', weight: 2, brief: 'offer to talk or help, in one short line' },
  { key: 'joke', weight: 1.5, brief: 'a small tease or joke about the post' },
  { key: 'question', weight: 2, brief: 'ask one short follow-up question about the post' },
  { key: 'encourage', weight: 1.5, brief: 'a word of encouragement, or a gentle correction of one mistake if the author is clearly learning the commenter\'s own language' },
]

type Random = () => number

export function pickCommentKind(random: Random = Math.random): { key: string; brief: string } {
  const total = COMMENT_KINDS.reduce((sum, kind) => sum + kind.weight, 0)
  let roll = random() * total
  for (const kind of COMMENT_KINDS) {
    roll -= kind.weight
    if (roll < 0) return kind
  }
  return COMMENT_KINDS[0]
}

export type CommenterPersona = {
  id: string
  name: string | null
  bio: string | null
  age: number | null
  city: string | null
  country: string | null
  /** The commenter's own language. */
  language: string
}

/**
 * The language a commenter writes in: their own when the post is in it; the
 * post's language when they are learning it; otherwise their own, which the
 * app translates for the reader.
 */
export function commentLanguageFor(commenter: Pick<CommenterPersona, 'id' | 'language'>, postLanguage: string | null): { language: string; asLearner: boolean } {
  const own = commenter.language.toLowerCase().split('-')[0]
  const post = (postLanguage ?? '').toLowerCase().split('-')[0]
  if (!post || post === own) return { language: commenter.language, asLearner: false }
  const learner = reserveLearnerPlan(commenter.id, commenter.language)
  if (learner.language === post) return { language: post, asLearner: true }
  return { language: commenter.language, asLearner: false }
}

export function buildCommentInstructions(language: string): string {
  const languageName = getSttLanguageDisplayName(language, 'en') || language
  return [
    'You ghostwrite one comment that a person leaves under someone else\'s post on Mingle, an app where people from different countries chat and learn each other\'s languages.',
    'The input JSON has "commenter" (who is writing), "voice" (their typing habits), "post" (the text, its language and, if it has one, what its photo shows), "existingComments" and "kind" (what this comment does).',
    `Write the comment in ${languageName} (${language}). If "asLearner" is true the commenter is still learning that language, at the level in "learnerLevel": keep it very simple and let the level show. Otherwise write the way a native speaker of the commenter's age types on their phone.`,
    'Length: a few words to one short sentence; never more than two short sentences. Most real comments are under 25 characters.',
    'Do what "kind" says, about the specific thing in this post. No generic praise that would fit any post, no summary of the post, no advice, no "thanks for sharing", and do not repeat what an existing comment already says.',
    'Follow "voice" for register, laughter, emoji and punctuation, lightly. No hashtags.',
    'Never include contact details, links, other apps, @mentions or phone numbers, and never mention being an AI.',
    'Answer with JSON: {"text": "<the comment>"}.',
  ].join('\n')
}

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: { text: { type: SchemaType.STRING } },
  required: ['text'],
}

/** A usable comment text, or null. */
export function cleanGeneratedComment(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
  if (!text || Array.from(text).length > OPERATOR_COMMENT_GENERATED_MAX_CHARS) return null
  if (hasContactDetails(text) || /(^|\s)#\S/.test(text)) return null
  return text
}

type GenerateFn = <T>(request: GenerateJsonRequest<T>) => Promise<T>

/** One model call. Returns the comment and its language, or null when the answer is unusable. Throws `LlmError` when the call fails. */
export async function generateOperatorComment(args: {
  commenter: CommenterPersona
  post: { text: string | null; language: string | null; photo?: string | null }
  existingComments: string[]
  generate?: GenerateFn
  random?: Random
}): Promise<{ text: string; language: string; kind: string } | null> {
  const profile = reservePosterProfile(args.commenter.id)
  const choice = commentLanguageFor(args.commenter, args.post.language)
  const learner = reserveLearnerPlan(args.commenter.id, args.commenter.language)
  const kind = pickCommentKind(args.random)
  const answer = await (args.generate ?? generateJson)({
    instructions: buildCommentInstructions(choice.language),
    input: {
      commenter: { name: args.commenter.name, bio: args.commenter.bio, age: args.commenter.age, city: args.commenter.city, country: args.commenter.country },
      voice: profile.voice,
      asLearner: choice.asLearner,
      learnerLevel: choice.asLearner ? learner.level.brief : null,
      post: { text: args.post.text ?? '', language: args.post.language, photo: args.post.photo ?? null },
      existingComments: args.existingComments.slice(-8),
      kind: kind.brief,
    },
    responseSchema: RESPONSE_SCHEMA,
    validate: (value) => (value as { text?: unknown } | null)?.text,
    model: resolveReserveModel(),
    temperature: 1,
    maxOutputTokens: 1024,
    timeoutMs: CALL_TIMEOUT_MS,
  })
  const text = cleanGeneratedComment(answer)
  return text ? { text, language: choice.language, kind: kind.key } : null
}
