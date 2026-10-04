/**
 * What kind of poster an operator account is. People differ far more in how
 * they post than in what they post about: one only ever writes three words,
 * another tells long stories, a third asks questions all day. The profile is
 * derived from the account id, so it never changes and needs no storage, and
 * it bends every choice the generator makes: topics, shapes, length and voice.
 */
export type PosterType = {
  key: string
  ko: string
  /** Told to the model. */
  brief: string
  /** Multipliers on the shape weights; a missing key is 1. */
  shapes: Record<string, number>
  /** Multipliers on the topic weights; a missing key is 1. */
  topics: Record<string, number>
}

export const POSTER_TYPES: readonly PosterType[] = [
  {
    key: 'diary', ko: '일기형',
    brief: 'logs what they did and ate in plain order, like a diary nobody is expected to read',
    shapes: { few_lines: 3, story: 2, question: 0.3 }, topics: { daily_moment: 3, food: 2, question_to_everyone: 0.3 },
  },
  {
    key: 'grumbler', ko: '투덜이',
    brief: 'mostly complains: tired, annoyed, lazy, things going slightly wrong; rarely pleased about anything',
    shapes: { reaction: 4, one_liner: 2, list: 0.3 }, topics: { work_study: 3, daily_moment: 2, looking_for_friends: 0.2 },
  },
  {
    key: 'asker', ko: '질문쟁이',
    brief: 'posts mostly to ask things; curious, and replies matter more to them than the post',
    shapes: { question: 5, few_lines: 1.5, fragment: 0.4 }, topics: { language_question: 3, culture_curiosity: 3, recommendation_request: 3, question_to_everyone: 2 },
  },
  {
    key: 'minimalist', ko: '단답형',
    brief: 'writes as little as possible: a few words, sometimes a single word, never explains',
    shapes: { fragment: 6, one_liner: 3, few_lines: 0.3, story: 0, list: 0.2 }, topics: {},
  },
  {
    key: 'storyteller', ko: '썰쟁이',
    brief: 'turns small incidents into stories with what people said quoted word for word, and enjoys the build-up',
    shapes: { story: 6, few_lines: 2, fragment: 0.3 }, topics: { daily_moment: 2, work_study: 2 },
  },
  {
    key: 'joker', ko: '드립형',
    brief: 'is always joking: exaggeration, self-mockery, absurd comparisons; almost never sincere',
    shapes: { one_liner: 3, reaction: 2, story: 1.5 }, topics: { thought: 2, daily_moment: 2 },
  },
  {
    key: 'sentimental', ko: '감성형',
    brief: 'is openly sentimental and a little poetic: writes about moods, the sky, songs and memories, and does describe feelings (the usual advice against that does not apply to this person)',
    shapes: { few_lines: 3, one_liner: 2, reaction: 0.4, list: 0.2 }, topics: { thought: 4, media: 2, travel_wish: 2 },
  },
  {
    key: 'enthusiast', ko: '덕후형',
    brief: 'is obsessed with one or two hobbies from the bio and goes into more detail about them than anyone asked for',
    shapes: { few_lines: 3, story: 2, list: 2 }, topics: { hobby: 5, media: 3, daily_moment: 0.5 },
  },
  {
    key: 'studious', ko: '공부기록형',
    brief: 'uses posts as a study log: what they learned, what confused them, with the actual word or phrase written out',
    shapes: { few_lines: 2, list: 3, question: 2 }, topics: { language_progress: 5, language_question: 5, work_study: 2 },
  },
  {
    key: 'foodie', ko: '먹는 얘기만',
    brief: 'talks about food almost every time: what they ate, where, how much, what they want next',
    shapes: { one_liner: 2, fragment: 2 }, topics: { food: 7, own_culture: 2, recommendation_request: 1.5 },
  },
  {
    key: 'friendly', ko: '인사·친목형',
    brief: 'is warm and sociable: greets people, answers their own post with a question back, wants to chat',
    shapes: { question: 2, one_liner: 2, few_lines: 2 }, topics: { looking_for_friends: 5, question_to_everyone: 3, culture_curiosity: 2 },
  },
  {
    key: 'explainer', ko: '정보공유형',
    brief: 'likes telling foreigners how things work where they live: small practical facts, tips and corrections of common misunderstandings',
    shapes: { few_lines: 3, list: 4, fragment: 0.3 }, topics: { own_culture: 6, food: 2, language_question: 1.5 },
  },
  {
    key: 'deadpan', ko: '건조체',
    brief: 'states things flatly with no emotion words, no exclamation and no laughter; the humor, if any, is in how dry it is',
    shapes: { one_liner: 4, fragment: 2 }, topics: {},
  },
  {
    key: 'rambler', ko: '의식의 흐름',
    brief: 'thinks out loud: starts on one thing and drifts to another in the same post, with run-on sentences and no conclusion',
    shapes: { few_lines: 3, story: 3, fragment: 0.5 }, topics: { thought: 3 },
  },
]

const LENGTHS = [
  { key: 'terse', ko: '짧게', brief: 'keeps everything shorter than the shape suggests; never more than three lines' },
  { key: 'medium', ko: '보통', brief: 'ordinary length for each shape' },
  { key: 'long', ko: '길게', brief: 'writes longer than the shape suggests, adding one more detail or aside every time' },
] as const

const REGISTERS = [
  'writes in the plain informal form, as if talking to themself or to friends; never the polite form',
  'writes mostly in the plain informal form and switches to the polite form only when asking strangers a question',
  'writes in a chatty polite form, but loosely, with dropped particles and trailing endings',
  'writes in clipped note form (noun or stem endings, the way people jot memos or post on forums)',
  'writes in a careful, fully polite form, slightly stiff, like someone who is shy online',
]
const LAUGHTER = [
  'almost never writes laughter',
  'adds written laughter or crying now and then in the way natives type it',
  'ends many posts with written laughter or crying in the way natives type it',
  'uses long keyboard-mash laughter when something is funny, and nothing otherwise',
]
const EMOJI = [
  'never uses emoji',
  'never uses emoji but uses text emoticons natives type',
  'uses an emoji in about one post out of five',
  'uses an emoji in about one post out of three',
  'uses the same one or two favorite emoji again and again',
]
const PUNCTUATION = [
  'usually leaves out the final period',
  'trails off with dots or a tilde instead of ending cleanly',
  'uses ordinary punctuation but short sentences',
  'breaks the line after every clause instead of using commas and periods',
  'piles up exclamation or question marks',
  'writes with no punctuation at all, only spaces',
]
const QUIRKS = [
  'overuses one favorite intensifier',
  'often starts a post with an interjection',
  'often corrects themself mid-post',
  'spaces and spells carelessly, with a typo in some posts',
  'drops a foreign word from a language they study into ordinary sentences',
  'ends posts by asking what others think',
  'mentions being hungry, sleepy or tired no matter the topic',
  'uses a mild regional expression from their city now and then',
  'adds a self-deprecating aside in brackets',
  'refers to the same few things again and again (a pet, a coworker, a favorite place)',
  'stretches final vowels or consonants for emphasis',
  'writes numbers and exact amounts whenever possible',
  'never states opinions directly; hedges with "maybe" and "I guess"',
  'is blunt and a little rude in a friendly way',
  'uses current slang heavily',
  'uses no slang at all, slightly old-fashioned wording',
]

function hash(seed: string): number {
  let state = 2166136261
  for (let index = 0; index < seed.length; index += 1) state = Math.imul(state ^ seed.charCodeAt(index), 16777619)
  return state >>> 0
}

/** mulberry32 */
function seeded(seed: string): () => number {
  let state = hash(seed)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export type PosterProfile = {
  type: PosterType
  length: (typeof LENGTHS)[number]
  /** Typing habits and quirks, told to the model. */
  voice: string[]
  shapeFactors: Record<string, number>
  topicFactors: Record<string, number>
  /** Short Korean label for staff. */
  labelKo: string
}

/** The fixed posting personality of one account. `topicKeys` are all topic keys the generator knows. */
export function posterProfile(seed: string, topicKeys: readonly string[] = []): PosterProfile {
  const random = seeded(`poster:${seed}`)
  const pickOne = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]
  const type = pickOne(POSTER_TYPES)
  // Minimalists stay short and storytellers do not: the length follows the type when it must.
  const length = type.key === 'minimalist' ? LENGTHS[0] : type.key === 'storyteller' || type.key === 'rambler' ? pickOne(LENGTHS.slice(1)) : pickOne(LENGTHS)

  const quirks: string[] = []
  while (quirks.length < 2) {
    const quirk = pickOne(QUIRKS)
    if (!quirks.includes(quirk)) quirks.push(quirk)
  }
  const voice = [
    pickOne(REGISTERS),
    type.key === 'deadpan' ? LAUGHTER[0] : pickOne(LAUGHTER),
    type.key === 'deadpan' ? EMOJI[0] : pickOne(EMOJI),
    pickOne(PUNCTUATION),
    ...quirks,
  ]

  // Personal taste on top of the type: two topics this person loves, two they never touch.
  const topicFactors: Record<string, number> = { ...type.topics }
  const pool = [...topicKeys]
  for (const factor of [3, 3, 0.15, 0.15]) {
    if (pool.length === 0) break
    const [key] = pool.splice(Math.floor(random() * pool.length), 1)
    topicFactors[key] = (topicFactors[key] ?? 1) * factor
  }

  return { type, length, voice, shapeFactors: type.shapes, topicFactors, labelKo: `${type.ko} · ${length.ko}` }
}
