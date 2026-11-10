import { SchemaType, type ResponseSchema } from '@google/generative-ai'
import { getSttLanguageDisplayName } from '@/lib/stt-languages'
import { generateJson, type GenerateJsonRequest } from '@/server/llm/generate-json'
import { reserveLearnerPlan, reservePosterProfile, resolveReserveModel, type LearningLanguage } from '@/server/operator-post-reserve/generate'
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

/** What a reply in a comment thread does: the post's author answering a comment, or another reader joining in. */
export const AUTHOR_REPLY_KINDS: ReadonlyArray<{ key: string; weight: number; brief: string }> = [
  { key: 'answer', weight: 4, brief: 'answer what the comment asks, or say one concrete thing back about what it says' },
  { key: 'thanks', weight: 2.5, brief: 'a short thank-you in their own words that picks up one detail of the comment' },
  { key: 'reaction', weight: 2.5, brief: 'react in a few words to what the comment says' },
  { key: 'ask_back', weight: 1.5, brief: 'ask the commenter one short question back' },
  { key: 'joke', weight: 1.2, brief: 'joke along with the comment' },
]

export const OTHER_REPLY_KINDS: ReadonlyArray<{ key: string; weight: number; brief: string }> = [
  { key: 'agree', weight: 3, brief: 'agree with the comment in their own words, adding one small thing' },
  { key: 'add', weight: 2.5, brief: 'add one small fact or experience of their own to what the comment says' },
  { key: 'joke', weight: 2, brief: 'joke along with the comment' },
  { key: 'question', weight: 1.5, brief: 'ask the commenter one short question' },
]

function pickKind(kinds: ReadonlyArray<{ key: string; weight: number; brief: string }>, random: Random): { key: string; brief: string } {
  const total = kinds.reduce((sum, kind) => sum + kind.weight, 0)
  let roll = random() * total
  for (const kind of kinds) {
    roll -= kind.weight
    if (roll < 0) return kind
  }
  return kinds[0]
}

export function pickCommentKind(random: Random = Math.random): { key: string; brief: string } {
  return pickKind(COMMENT_KINDS, random)
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
  /** The profile's 관심 언어 with their 1-5 level. */
  learning?: LearningLanguage[]
  gender?: string | null
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

export function buildCommentInstructions(language: string, reply = false): string {
  const languageName = getSttLanguageDisplayName(language, 'en') || language
  return [
    ...(reply
      ? [
          'You ghostwrite one reply in a comment thread under a post on HashChat, an app where people from different countries chat and learn each other\'s languages.',
          'The input JSON has "commenter" (who is writing the reply), "voice" (their typing habits), "post" (the text, its language and, if it has one, what its photo shows), "replyingTo" (the comment being answered), "thread" (replies already under it), "asPostAuthor" (true when the replier wrote the post) and "kind" (what this reply does).',
        ]
      : [
          'You ghostwrite one comment that a person leaves under someone else\'s post on HashChat, an app where people from different countries chat and learn each other\'s languages.',
          'The input JSON has "commenter" (who is writing), "voice" (their typing habits), "post" (the text, its language and, if it has one, what its photo shows), "existingComments" and "kind" (what this comment does).',
        ]),
    `Write the ${reply ? 'reply' : 'comment'} in ${languageName} (${language}). If "asLearner" is true the commenter is still learning that language, at the level in "learnerLevel": keep it very simple and let the level show. Otherwise write the way a native speaker of the commenter's age types on their phone.`,
    reply
      ? 'Length: a few words; replies are even shorter than comments, most under 20 characters, never more than one short sentence.'
      : 'Length: a few words to one short sentence; never more than two short sentences. Most real comments are under 25 characters.',
    reply
      ? 'Answer the comment in "replyingTo" directly and do what "kind" says. When "asPostAuthor" is true you are the person who wrote the post, answering someone under it; otherwise you are another reader joining in. No stock "thanks for the comment", and do not repeat anything already in "thread".'
      : 'Do what "kind" says, about the specific thing in this post. No generic praise that would fit any post, no summary of the post, no advice, no "thanks for sharing", and do not repeat what an existing comment already says.',
    'Follow "voice" for register, laughter, emoji and punctuation, lightly: a quirk from "voice" appears in at most one comment in three, so usually leave it out. No hashtags.',
    'Do not claim to have visited a place the post mentions, and do not name a specific shop, restaurant or business unless the post already names it.',
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
  /** Set for a reply: the comment answered, what is already under it, and whether the replier wrote the post. */
  replyTo?: { text: string; language: string | null; thread: string[]; asPostAuthor: boolean }
  generate?: GenerateFn
  random?: Random
}): Promise<{ text: string; language: string; kind: string } | null> {
  const profile = reservePosterProfile(args.commenter.id, args.commenter.gender ?? null)
  // A reply follows the language of the comment it answers, the same way a comment follows the post.
  const choice = commentLanguageFor(args.commenter, args.replyTo ? args.replyTo.language ?? args.post.language : args.post.language)
  const learner = reserveLearnerPlan(args.commenter.id, args.commenter.language, args.commenter.learning)
  const random = args.random ?? Math.random
  const kind = args.replyTo ? pickKind(args.replyTo.asPostAuthor ? AUTHOR_REPLY_KINDS : OTHER_REPLY_KINDS, random) : pickCommentKind(random)
  const answer = await (args.generate ?? generateJson)({
    instructions: buildCommentInstructions(choice.language, Boolean(args.replyTo)),
    input: {
      commenter: { name: args.commenter.name, bio: args.commenter.bio, age: args.commenter.age, city: args.commenter.city, country: args.commenter.country },
      voice: profile.voice,
      asLearner: choice.asLearner,
      learnerLevel: choice.asLearner ? learner.level.brief : null,
      post: { text: args.post.text ?? '', language: args.post.language, photo: args.post.photo ?? null },
      ...(args.replyTo
        ? { replyingTo: args.replyTo.text, thread: args.replyTo.thread.slice(-6), asPostAuthor: args.replyTo.asPostAuthor }
        : { existingComments: args.existingComments.slice(-8) }),
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
