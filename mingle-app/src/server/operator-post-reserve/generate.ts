import { SchemaType, type ResponseSchema } from '@google/generative-ai'
import { getSttLanguageDisplayName } from '@/lib/stt-languages'
import { generateJson, type GenerateJsonRequest } from '@/server/llm/generate-json'
import { hasContactDetails } from '@/server/operators/persona-rules'

/**
 * Writes latent posts for one operator account: original short posts in the
 * account's own language and voice, in the style common on language-exchange
 * apps. The server picks the topics (so one account's 200 posts cover many
 * subjects); the model only writes the text. Because a post may go out
 * months later, nothing in it may depend on the date.
 */
export const RESERVE_CHUNK_SIZE = 20
export const RESERVE_POST_MAX_CHARS = 400
const AVOID_SAMPLE_MAX = 40
const AVOID_SAMPLE_CHARS = 60
const CALL_TIMEOUT_MS = 120_000
/** Posts need a stronger writer than chat replies: the small model writes every post as the same tidy sentence. */
export const RESERVE_DEFAULT_MODEL = 'gemini-3.8-flash'

export function resolveReserveModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPERATOR_POST_RESERVE_MODEL?.trim() || RESERVE_DEFAULT_MODEL
}

/** Post kinds seen on language-exchange apps; `weight` is the relative share. */
export const RESERVE_TOPICS: ReadonlyArray<{ key: string; weight: number; brief: string }> = [
  { key: 'daily_moment', weight: 5, brief: 'a small moment from an ordinary day (commute, errands, a walk, home)' },
  { key: 'food', weight: 5, brief: 'something they ate, cooked or crave; local food of their city' },
  { key: 'language_question', weight: 4, brief: 'a question about a language they are learning: a word, an expression, a nuance they find confusing' },
  { key: 'language_progress', weight: 3, brief: 'how their language study is going: a small win, a struggle, a habit' },
  { key: 'culture_curiosity', weight: 3, brief: 'something about another country\'s culture they are curious about, asked to people from there' },
  { key: 'own_culture', weight: 3, brief: 'something about daily life or customs where they live that foreigners may not know' },
  { key: 'media', weight: 4, brief: 'a drama, film, song, book, game or anime they enjoy, without claiming it is new' },
  { key: 'hobby', weight: 4, brief: 'a hobby or something they are practicing (sport, music, drawing, photography, cooking)' },
  { key: 'work_study', weight: 3, brief: 'work or study life in general terms: tiredness, motivation, a small complaint or joy' },
  { key: 'travel_wish', weight: 3, brief: 'a place they want to visit or a memory of a trip' },
  { key: 'recommendation_request', weight: 3, brief: 'asking others for a recommendation (music, shows, food, places, study methods)' },
  { key: 'thought', weight: 3, brief: 'a light thought or feeling, a mood, a small observation about people or life' },
  { key: 'question_to_everyone', weight: 3, brief: 'an easy question to everyone that invites replies (preferences, habits, this-or-that)' },
  { key: 'looking_for_friends', weight: 1, brief: 'saying they would like to chat with people and what they like to talk about' },
]

type Random = () => number

/** `count` topic keys by weight, never more than 2 of one topic in a chunk. */
export function pickReserveTopics(count: number, random: Random = Math.random): string[] {
  const total = RESERVE_TOPICS.reduce((sum, topic) => sum + topic.weight, 0)
  const used = new Map<string, number>()
  const picked: string[] = []
  let guard = count * 20
  while (picked.length < count && guard-- > 0) {
    let roll = random() * total
    let chosen = RESERVE_TOPICS[RESERVE_TOPICS.length - 1]
    for (const topic of RESERVE_TOPICS) {
      roll -= topic.weight
      if (roll < 0) {
        chosen = topic
        break
      }
    }
    if ((used.get(chosen.key) ?? 0) >= 2) continue
    used.set(chosen.key, (used.get(chosen.key) ?? 0) + 1)
    picked.push(chosen.key)
  }
  return picked
}

/**
 * The form of one post. The server picks it per slot: left to itself the
 * model writes every post as one complete, polite, reflective sentence.
 */
export const RESERVE_SHAPES: ReadonlyArray<{ key: string; weight: number; brief: string }> = [
  { key: 'fragment', weight: 3, brief: 'a fragment of two to eight words, not a complete sentence, like something muttered' },
  { key: 'one_liner', weight: 4, brief: 'one short blunt sentence' },
  { key: 'reaction', weight: 2.5, brief: 'a complaint, a groan or an excited outburst about one concrete thing that just happened' },
  { key: 'question', weight: 2, brief: 'only a short direct question, with no lead-in before it' },
  { key: 'few_lines', weight: 3, brief: 'two or three short sentences that include one concrete detail (a number, a dish, a title, a place)' },
  { key: 'story', weight: 1.5, brief: 'a loose little story of four to six short lines with line breaks, ending flat or with a small joke rather than a lesson' },
  { key: 'list', weight: 0.5, brief: 'a tiny list of two to four items on separate lines, with a few words before it' },
]

const VOICE_REGISTERS = [
  'writes in the plain informal form, as if talking to themself or to friends; never the polite form',
  'writes mostly in the plain informal form and switches to the polite form only when asking strangers a question',
  'writes in a chatty polite form, but loosely, with dropped particles and trailing endings',
] as const
const VOICE_LAUGHTER = [
  'almost never writes laughter',
  'adds written laughter or crying now and then in the way natives type it',
  'ends many posts with written laughter or crying in the way natives type it',
] as const
const VOICE_EMOJI = ['never uses emoji', 'uses an emoji in about one post out of five', 'uses an emoji in about one post out of three'] as const
const VOICE_PUNCTUATION = [
  'usually leaves out the final period',
  'trails off with dots or a tilde instead of ending cleanly',
  'uses ordinary punctuation but short sentences',
] as const

function seedNumber(seed: string): number {
  let state = 2166136261
  for (let index = 0; index < seed.length; index += 1) state = Math.imul(state ^ seed.charCodeAt(index), 16777619)
  return state >>> 0
}

/** The account's writing habits: fixed per account, so all its posts sound like one person. */
export function reserveVoice(seed: string): string[] {
  const number = seedNumber(seed)
  return [
    VOICE_REGISTERS[number % VOICE_REGISTERS.length],
    VOICE_LAUGHTER[(number >>> 4) % VOICE_LAUGHTER.length],
    VOICE_EMOJI[(number >>> 8) % VOICE_EMOJI.length],
    VOICE_PUNCTUATION[(number >>> 12) % VOICE_PUNCTUATION.length],
  ]
}

function pickShape(random: Random): { key: string; brief: string } {
  const total = RESERVE_SHAPES.reduce((sum, shape) => sum + shape.weight, 0)
  let roll = random() * total
  for (const shape of RESERVE_SHAPES) {
    roll -= shape.weight
    if (roll < 0) return shape
  }
  return RESERVE_SHAPES[0]
}

export type ReservePersona = {
  name: string | null
  bio: string | null
  age: number | null
  city: string | null
  country: string | null
  /** The language every post is written in (primaryLanguages[0]). */
  language: string
}

export type GeneratedReservePost = { topic: string; text: string }

export function buildReserveInstructions(persona: Pick<ReservePersona, 'language'>): string {
  const languageName = getSttLanguageDisplayName(persona.language, 'en') || persona.language
  return [
    'You ghostwrite short social posts for one person on Mingle, an app where people from different countries chat and learn each other\'s languages.',
    'The input JSON has "persona" (who is posting), "voice" (this person\'s typing habits), "slots" (one post per slot; each has a number, a "topic" and a "shape"), and "alreadyWritten" (the starts of posts this person already has).',
    `Write every post in ${languageName} (${persona.language}) exactly the way a native speaker of the persona's age types on their phone to friends: the slang, abbreviations, sentence endings and written laughter that are normal in that language right now. A person learning another language may add one short phrase in that language when the topic is language learning; otherwise use only ${languageName}.`,
    'Follow "voice" in every post, and follow each slot\'s "shape" literally. The shapes differ on purpose: the posts must not share one length, one rhythm or one sentence ending.',
    'What makes a post sound human: it is about one specific thing (the actual dish, the actual title, the number of hours, the exact annoying thing), it starts in the middle without setting the scene, and it does not explain how the writer feels about it.',
    'What makes a post sound machine-written, so never do it: a tidy general statement about what is nice, precious or special; describing a mood or an atmosphere; a reflective conclusion or a lesson; balanced, complete, well-formed sentences one after another; addressing "everyone"; asking a survey-like question about preferences in formal wording; words like "truly", "precious", "special", "moment", "time to" used to wrap up a feeling.',
    'Imperfection is welcome: dropped subjects and particles, a run-on, an abrupt stop, a mild typo once in a while. Mild grumbling, laziness, boredom and self-mockery are more common than gratitude.',
    'Emoji and laughter only as "voice" says. A habit shows in some posts, not in every one: most posts must not end the same way (same emoji position, same trailing dots, same laughter). No hashtags.',
    'Questions must not all open the same way (not always "everyone" or "does anyone"); often just ask the thing.',
    'Every post must differ from the others and from "alreadyWritten" in subject and opening words.',
    'The posts are published on unknown future days. Words like "today", "just now", "earlier" and "tonight" are fine. Never mention a date, weekday, month, season, weather, temperature, holiday, exam period or current event.',
    'Use only facts consistent with the persona. Do not invent a specific employer, school or real person. No politics, religion debate, sexual content, or anything about money or selling.',
    'Never include contact details, links, other apps, @mentions or phone numbers, and never mention Mingle or being an AI.',
    'Answer with JSON: {"posts": [{"slot": <number>, "text": "<the post>"}]} with exactly one entry per slot.',
  ].join('\n')
}

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    posts: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: { slot: { type: SchemaType.INTEGER }, text: { type: SchemaType.STRING } },
        required: ['slot', 'text'],
      },
    },
  },
  required: ['posts'],
}

const MINGLE_PATTERN = /mingle|밍글|ミングル/i
const HASHTAG_PATTERN = /(^|\s)#\S/

/** A usable post text, or null. */
export function cleanReservePost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
  if (!text || Array.from(text).length > RESERVE_POST_MAX_CHARS) return null
  if (hasContactDetails(text) || MINGLE_PATTERN.test(text) || HASHTAG_PATTERN.test(text)) return null
  return text
}

/** Comparison key that ignores case, spacing and punctuation. */
export function reservePostKey(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

type GenerateFn = <T>(request: GenerateJsonRequest<T>) => Promise<T>

/**
 * One model call: up to `topics.length` posts for the persona. Invalid and
 * duplicate items are dropped, so the result may be shorter than asked.
 * Throws `LlmError` when the call itself fails.
 */
export async function generateReservePosts(args: {
  persona: ReservePersona
  topics: string[]
  /** Texts the account already has (published or waiting), to steer away from repeats. */
  existingTexts: string[]
  generate?: GenerateFn
  model?: string
  random?: Random
}): Promise<GeneratedReservePost[]> {
  const generate = args.generate ?? generateJson
  const briefs = new Map(RESERVE_TOPICS.map((topic) => [topic.key, topic.brief]))
  const random = args.random ?? Math.random
  const slots = args.topics.map((topic, index) => ({ slot: index + 1, topic: briefs.get(topic) ?? topic, shape: pickShape(random).brief }))
  const seen = new Set(args.existingTexts.map(reservePostKey))

  const items = await generate({
    instructions: buildReserveInstructions(args.persona),
    input: {
      persona: args.persona,
      voice: reserveVoice(`${args.persona.name ?? ''}|${args.persona.city ?? ''}|${args.persona.language}`),
      slots,
      alreadyWritten: args.existingTexts.slice(-AVOID_SAMPLE_MAX).map((text) => Array.from(text).slice(0, AVOID_SAMPLE_CHARS).join('')),
    },
    responseSchema: RESPONSE_SCHEMA,
    validate: (value) => {
      const posts = (value as { posts?: unknown } | null)?.posts
      if (!Array.isArray(posts)) throw new Error('invalid_posts')
      return posts as Array<{ slot?: unknown; text?: unknown }>
    },
    model: args.model ?? resolveReserveModel(),
    temperature: 1,
    maxOutputTokens: 8192,
    timeoutMs: CALL_TIMEOUT_MS,
  })

  const result: GeneratedReservePost[] = []
  const usedSlots = new Set<number>()
  for (const item of items) {
    const slot = typeof item?.slot === 'number' ? item.slot : Number.NaN
    if (!Number.isInteger(slot) || slot < 1 || slot > slots.length || usedSlots.has(slot)) continue
    const text = cleanReservePost(item.text)
    if (!text) continue
    const key = reservePostKey(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    usedSlots.add(slot)
    result.push({ topic: args.topics[slot - 1], text })
  }
  return result
}
