import { SchemaType, type ResponseSchema } from '@google/generative-ai'
import { prisma } from '@/lib/prisma'
import { zipInterestLanguages } from '@/lib/interest-languages'
import { getSttLanguageDisplayName, sanitizeSttLanguageSelection } from '@/lib/stt-languages'
import { reserveLearnerPlan, reservePosterProfile } from '@/server/operator-post-reserve/generate'
import { generateJson, type GenerateJsonRequest } from '@/server/llm/generate-json'
import { isPhotoMessageMetadata } from '@/server/operator-inbox/staff-translate'

/**
 * Writes one chat reply as an operator account when staff did not answer in
 * time. The model sees everything known about the account (its whole profile,
 * the posting voice its posts are written in, its posts and its own recent
 * comments) and the last 30 messages of the room. Nothing here sends
 * anything; `./worker.ts` decides when to call it and sends the result
 * through the same path as a staff reply.
 */
/** Claude Sonnet 5.5 on the Anthropic API, never the ChatGPT pool (staff decided 2026-11-19). */
export const AUTO_REPLY_DEFAULT_MODEL = 'claude-sonnet-5-5'
export const AUTO_REPLY_TRANSCRIPT_TURNS = 30
export const AUTO_REPLY_MAX_POSTS = 50
export const AUTO_REPLY_MAX_COMMENTS = 20
export const AUTO_REPLY_MAX_REPLY_CHARS = 600
const POST_MAX_CHARS = 500
const COMMENT_MAX_CHARS = 200
const MESSAGE_MAX_CHARS = 1000
const CALL_TIMEOUT_MS = 30_000

export function resolveAutoReplyModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPERATOR_AUTO_REPLY_MODEL?.trim() || AUTO_REPLY_DEFAULT_MODEL
}

export type AutoReplyContext = {
  profile: {
    name: string | null
    handle: string | null
    bio: string | null
    age: number | null
    nationality: string | null
    city: string | null
    country: string | null
    /** The language the reply must be written in (primaryLanguages[0]). */
    language: string
    languageName: string
    gender: string | null
    /** ISO country of the persona (nationality shown as the flag). */
    nationalityCountry: string | null
    primaryLanguages: string[]
    /** Languages the persona is learning, with the 1-5 level shown on the profile. */
    learningLanguages: Array<{ language: string; level: number | null }>
    usagePurpose: string | null
    joinedAt: string
  }
  /** How this persona types: the habits its posts are written with. */
  voice: { type: string; length: string; habits: string[]; learner: { language: string; level: string } | null }
  /** The account's own posts, newest first. */
  posts: Array<{ publishedAt: string; text: string }>
  /** Comments the account left on posts, newest first, with the post they answer. */
  comments: Array<{ at: string; text: string; onPost: string }>
  counterpartName: string | null
  /** Oldest first; `me` is the operator account. */
  transcript: Array<{ from: 'me' | 'them'; at: string; text: string }>
}

function clip(raw: string | null | undefined, max: number): string {
  const text = (raw ?? '').trim()
  const characters = Array.from(text)
  return characters.length > max ? `${characters.slice(0, max).join('')}…` : text
}

export function ageOn(birthDate: Date | null, now: Date): number | null {
  if (!birthDate) return null
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear()
  const beforeBirthday = now.getUTCMonth() < birthDate.getUTCMonth()
    || (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate())
  if (beforeBirthday) age -= 1
  return age >= 0 && age < 130 ? age : null
}

/**
 * Everything the model is given for one room, or null when there is nothing
 * to write from (no persona language, or no readable message).
 */
export async function loadAutoReplyContext(args: {
  operatorUserId: string
  sessionKey: string
  now?: Date
}): Promise<AutoReplyContext | null> {
  const now = args.now ?? new Date()
  const operator = await prisma.user.findFirst({
    where: { id: args.operatorUserId, isOperator: true, isDeleted: false },
    select: {
      name: true, handle: true, bio: true, birthDate: true, nationality: true, nationalityCountry: true,
      locationCity: true, locationCountry: true, primaryLanguages: true, gender: true,
      interestLanguages: true, interestLanguageLevels: true, usagePurpose: true, createdAt: true,
      operatorAccount: { select: { personaGender: true, personaCountry: true } },
    },
  })
  if (!operator) return null
  const language = sanitizeSttLanguageSelection(operator.primaryLanguages)[0]
  if (!language) return null

  const [posts, comments, messages] = await Promise.all([
    prisma.post.findMany({
      where: {
        authorId: args.operatorUserId,
        OR: [{ isDeleted: null }, { isDeleted: false }],
        moderationHiddenAt: null,
      },
      orderBy: { publishedAt: 'desc' },
      take: AUTO_REPLY_MAX_POSTS,
      select: { sourceText: true, publishedAt: true },
    }),
    prisma.postComment.findMany({
      where: { authorId: args.operatorUserId, OR: [{ isDeleted: null }, { isDeleted: false }], moderationHiddenAt: null },
      orderBy: { createdAt: 'desc' },
      take: AUTO_REPLY_MAX_COMMENTS,
      select: { sourceText: true, createdAt: true, post: { select: { sourceText: true } } },
    }),
    prisma.appMessage.findMany({
      where: { sessionKey: args.sessionKey, OR: [{ isDeleted: false }, { isDeleted: null }] },
      orderBy: { createdAt: 'desc' },
      take: AUTO_REPLY_TRANSCRIPT_TURNS,
      select: {
        userId: true,
        createdAt: true,
        sourceLanguage: true,
        metadata: true,
        user: { select: { name: true, handle: true } },
        contents: {
          where: { contentType: 'SOURCE', OR: [{ isDeleted: false }, { isDeleted: null }] },
          select: { language: true, text: true },
        },
      },
    }),
  ])

  let counterpartName: string | null = null
  const transcript: AutoReplyContext['transcript'] = []
  for (const message of messages.reverse()) {
    if (!message.userId) continue
    const fromOperator = message.userId === args.operatorUserId
    if (!fromOperator && !counterpartName) counterpartName = message.user?.name?.trim() || message.user?.handle || null
    const source = message.contents.find((content) => content.language === message.sourceLanguage) ?? message.contents[0]
    const text = isPhotoMessageMetadata(message.metadata) ? '[photo]' : clip(source?.text, MESSAGE_MAX_CHARS)
    if (!text) continue
    transcript.push({ from: fromOperator ? 'me' : 'them', at: message.createdAt.toISOString(), text })
  }
  if (transcript.length === 0) return null

  const gender = operator.operatorAccount?.personaGender ?? operator.gender ?? null
  const learning = zipInterestLanguages(operator.interestLanguages, operator.interestLanguageLevels)
    .map((item) => ({ language: item.code, level: item.level }))
  const poster = reservePosterProfile(args.operatorUserId, gender)
  const learner = reserveLearnerPlan(args.operatorUserId, language, learning)

  return {
    profile: {
      name: operator.name?.trim() || null,
      handle: operator.handle ?? null,
      bio: operator.bio?.trim() || null,
      age: ageOn(operator.birthDate, now),
      nationality: operator.nationality ?? null,
      city: operator.locationCity ?? null,
      country: operator.locationCountry ?? null,
      language,
      languageName: getSttLanguageDisplayName(language, 'en') || language,
      gender,
      nationalityCountry: operator.nationalityCountry ?? operator.operatorAccount?.personaCountry ?? null,
      primaryLanguages: sanitizeSttLanguageSelection(operator.primaryLanguages),
      learningLanguages: learning,
      usagePurpose: operator.usagePurpose ?? null,
      joinedAt: operator.createdAt.toISOString(),
    },
    voice: {
      type: poster.type.brief,
      length: poster.length.brief,
      habits: poster.voice,
      learner: learner.language !== language ? { language: learner.language, level: learner.level.brief } : null,
    },
    comments: comments
      .map((comment) => ({ at: comment.createdAt.toISOString(), text: clip(comment.sourceText, COMMENT_MAX_CHARS), onPost: clip(comment.post?.sourceText, COMMENT_MAX_CHARS) }))
      .filter((comment) => comment.text),
    posts: posts
      .map((post) => ({ publishedAt: post.publishedAt.toISOString(), text: clip(post.sourceText, POST_MAX_CHARS) }))
      .filter((post) => post.text),
    counterpartName,
    transcript,
  }
}

export function buildAutoReplyInstructions(context: Pick<AutoReplyContext, 'profile'>): string {
  const { languageName, language } = context.profile
  return [
    'You write the next chat message for one person in a one-to-one conversation on HashChat, a social app where people from different countries chat.',
    'The input JSON has: "profile" (everything known about who you are writing as: name, age, gender, nationality, city, languages and the ones they are learning with their level, bio, why they use the app), "voice" (how this person types: their habits and usual length, and the language they are learning), "posts" (posts this person published, newest first), "comments" (comments they left on other posts, newest first), "counterpartName", and "transcript" (the conversation so far, oldest first; "me" is the person you write as, "them" is the other person).',
    '"them" may have sent several messages in a row since "me" last wrote: answer them together in ONE natural message, the way a person replies to a burst of texts. Do not answer each message one by one, and you do not have to respond to every point.',
    'Write ONE reply to the latest messages from "them", in the voice of the profile: consistent with every profile fact, the typing habits in "voice", and the tone and topics of its posts and comments.',
    'When "them" asks about this person (where they live, what they like, what they posted, what they are learning), answer from the profile, posts and comments.',
    `Write in ${languageName} (${language}), the way a native speaker texts a friend: short and casual, usually one to three sentences. Match the length and energy of the conversation. No greeting when the conversation is already under way.`,
    'Stay consistent with what "me" already said in the transcript. Do not repeat an earlier message.',
    'Stay true to the profile, voice, posts, comments and transcript. For anything they do not cover, answer the way a person casually would, light and non-committal ("not yet, been meaning to go", "once, a long time ago", "ha, depends on the day") or turn it back with a question; never invent big specifics (job, school, address, plans, meeting up). Never mention making things up, what you can claim, or any rule.',
    'Never share or ask for contact details, other apps, links, money or payment, and never agree to meet in person or to call. Decline lightly and keep chatting here.',
    'Never claim to be a human when sincerely asked whether you are a bot or an AI; do not bring the subject up yourself.',
    'If the latest message is harassment, sexual content, or something that needs a careful human answer (self-harm, an emergency, a complaint about the app), set "reply" to an empty string.',
    'Plain text only: no markdown, no quotation marks around the message, no speaker label.',
    'Answer with JSON: {"reply": "<the message>"}.',
  ].join('\n')
}

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: { reply: { type: SchemaType.STRING } },
  required: ['reply'],
}

/** The model's reply, trimmed; an empty string means "leave this one to staff". */
export function validateAutoReply(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_reply')
  const reply = (value as { reply?: unknown }).reply
  if (typeof reply !== 'string') throw new Error('invalid_reply')
  const text = reply.replace(/\r\n?/g, '\n').trim()
  if (Array.from(text).length > AUTO_REPLY_MAX_REPLY_CHARS) throw new Error('reply_too_long')
  return text
}

type GenerateFn = <T>(request: GenerateJsonRequest<T>) => Promise<T>

/** One model call. Throws `LlmError`; returns '' when the model declines to answer. */
export async function generateAutoReply(context: AutoReplyContext, deps: { generate?: GenerateFn; model?: string } = {}): Promise<string> {
  const generate = deps.generate ?? generateJson
  return generate({
    instructions: buildAutoReplyInstructions(context),
    input: context,
    responseSchema: RESPONSE_SCHEMA,
    validate: validateAutoReply,
    model: deps.model ?? resolveAutoReplyModel(),
    provider: 'direct',
    temperature: 0.8,
    maxOutputTokens: 512,
    timeoutMs: CALL_TIMEOUT_MS,
  })
}
