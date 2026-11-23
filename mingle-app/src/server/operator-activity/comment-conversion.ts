import { SchemaType, type ResponseSchema } from '@google/generative-ai'
import { getSttLanguageDisplayName } from '@/lib/stt-languages'
import { prisma } from '@/lib/prisma'
import { generateJson, OPERATOR_TEXT_MODEL } from '@/server/llm/generate-json'
import { ageOn } from '@/server/operator-auto-reply/generate'
import { personaLanguageOf } from '@/server/operator-posts/operator-check'
import {
  normalizePersonaLanguage,
  PersonaConversionFailedError,
  PersonaLanguageMissingError,
  pickConvertedText,
  resolveDetectedLanguage,
  type PersonaConversion,
} from '@/server/operator-posts/convert'
import { requireOperatorAccount } from '@/server/operators/operator-guard'
import { isUndetectableText } from '@/server/translation/detect-source-language'

/**
 * A comment or reply staff write by hand as an operator account (admin
 * activity) is turned into the persona's language the way that person would
 * actually type it: spoken, casual comment language, never written or
 * literary style (staff, 2026-11-23: "世の中には変態がどれだけ多いことか…"
 * read like a book). The model sees who writes, who it answers, the post and
 * the thread, so the tone fits the conversation. Claude Haiku 5.5: staff
 * already write casually, so this is translation with a tone rule, not
 * writing (staff, 2026-11-23; Opus stays for text operators write themselves).
 */
const CALL_TIMEOUT_MS = 60_000
/** Root comments shown as context for a new root comment. */
const CONTEXT_ROOT_COMMENTS = 8
/** Replies of the answered thread shown as context. */
const CONTEXT_THREAD_REPLIES = 20
const CONTEXT_TEXT_MAX_CHARS = 600

export type CommentPerson = {
  name: string | null
  age?: number | null
  gender?: string | null
  city?: string | null
  country?: string | null
  languages?: string[]
  isYou?: boolean
}

export type CommentConversionInput = {
  draft: string
  targetLanguage: string
  writer: CommentPerson & { bio?: string | null }
  /** The person the reply answers (or the post's author for a root comment). */
  addressee: CommentPerson | null
  post: { author: CommentPerson; text: string | null; hasPhoto: boolean }
  /** Root comment being answered, then its replies, oldest first. Empty for a root comment. */
  thread: Array<{ author: CommentPerson; text: string }>
  /** Other root comments on the post, oldest first (context for a root comment). */
  otherComments: Array<{ author: CommentPerson; text: string }>
}

export function buildCommentConversionInstructions(targetLanguage: string): string {
  const name = getSttLanguageDisplayName(targetLanguage) ?? targetLanguage
  return [
    `Staff drafted a social media comment for "writer" in "draft". Rewrite it as the comment the writer would actually type, in ${name} (${targetLanguage}).`,
    'Return JSON: sourceLanguage = the language code the draft is written in; text = the comment in the target language.',
    'Tone: spoken, casual comment language, the way people of the writer\'s age really type comments and replies on a social app. Short sentences, natural fillers and sentence endings are fine.',
    'Never written, literary, formal or textbook style: no essay phrasing, no rhetorical exclamations from books, no stiff polite set phrases. In Japanese, for example, avoid literary forms like 〜ことか, 〜であろう, 〜のである; in Korean avoid 문어체 endings like 〜이다/〜한다 in a chat.',
    'Fit the conversation: read "post", "thread" (the comment being answered and its replies) and "otherComments". Match how close the writer is to the "addressee" and how they have been talking; if the addressee wrote casually, answer casually.',
    'Keep the draft\'s meaning and attitude. Do not add facts, questions, greetings or emoji that are not in the draft, and do not drop anything. Keep @mentions, URLs and emoji unchanged.',
    'When the draft already is in the target language, return it unchanged.',
  ].join('\n')
}

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: { sourceLanguage: { type: SchemaType.STRING }, text: { type: SchemaType.STRING } },
  required: ['sourceLanguage', 'text'],
}

type ConversionAnswer = { sourceLanguage: string; text: string }

function validateAnswer(value: unknown): ConversionAnswer {
  const answer = value as { sourceLanguage?: unknown; text?: unknown } | null
  const text = typeof answer?.text === 'string' ? answer.text.trim() : ''
  if (!text) throw new Error('empty')
  return { sourceLanguage: typeof answer?.sourceLanguage === 'string' ? answer.sourceLanguage : '', text }
}

function clip(text: string | null | undefined): string {
  const value = (text ?? '').trim()
  return value.length > CONTEXT_TEXT_MAX_CHARS ? `${value.slice(0, CONTEXT_TEXT_MAX_CHARS)}…` : value
}

type Generate = (request: Parameters<typeof generateJson<ConversionAnswer>>[0]) => Promise<ConversionAnswer>

/** Turns a ready input into the comment to post (no database access). */
export async function convertCommentDraft(input: CommentConversionInput, options: { now?: Date; generate?: Generate } = {}): Promise<PersonaConversion> {
  const language = input.targetLanguage
  const draft = input.draft
  if (!draft.trim() || isUndetectableText(draft)) return { text: draft, language, converted: false, sourceLanguage: null }

  const generate = options.generate ?? generateJson<ConversionAnswer>
  let answer: ConversionAnswer
  try {
    answer = await generate({
      instructions: buildCommentConversionInstructions(language),
      input: { ...input, targetLanguage: undefined },
      responseSchema: RESPONSE_SCHEMA,
      validate: validateAnswer,
      model: OPERATOR_TEXT_MODEL,
      provider: 'direct',
      maxOutputTokens: 1024,
      timeoutMs: CALL_TIMEOUT_MS,
    })
  } catch (error) {
    throw new PersonaConversionFailedError(error)
  }

  const sourceLanguage = resolveDetectedLanguage(answer.sourceLanguage, draft)
  if (sourceLanguage === language) return { text: draft, language, converted: false, sourceLanguage }
  const text = pickConvertedText({ [language]: answer.text }, language, sourceLanguage, draft)
  if (!text) throw new PersonaConversionFailedError()
  return { text, language, converted: text !== draft.trim(), sourceLanguage }
}

const PERSON_SELECT = {
  id: true, name: true, birthDate: true, locationCity: true, locationCountry: true, primaryLanguages: true,
  operatorAccount: { select: { personaGender: true } },
} as const

type PersonRow = { id: string; name: string | null; birthDate: Date | null; locationCity: string | null; locationCountry: string | null; primaryLanguages: string[]; operatorAccount: { personaGender: string | null } | null }

function person(row: PersonRow | null | undefined, now: Date, writerId: string): CommentPerson {
  if (!row) return { name: null }
  return {
    name: row.name?.trim() || null,
    age: ageOn(row.birthDate, now),
    gender: row.operatorAccount?.personaGender ?? null,
    city: row.locationCity ?? null,
    country: row.locationCountry ?? null,
    languages: row.primaryLanguages.slice(0, 2),
    ...(row.id === writerId ? { isYou: true } : {}),
  }
}

const VISIBLE_COMMENT = { moderationHiddenAt: null, OR: [{ isDeleted: null }, { isDeleted: false }] }

/**
 * Converts a staff draft for `postId` (a reply when `parentId` is set) into the
 * operator's persona language as a casual comment, with the post, the thread
 * and the people in it as context. Throws `OperatorAccountRequiredError`,
 * `PersonaLanguageMissingError` or `PersonaConversionFailedError`.
 */
export async function convertStaffCommentDraft(args: {
  operatorUserId: string
  postId: string
  text: string
  parentId?: string | null
  replyToUserId?: string | null
  now?: Date
  generate?: Generate
}): Promise<PersonaConversion> {
  const account = await requireOperatorAccount(args.operatorUserId)
  const language = normalizePersonaLanguage(personaLanguageOf(account))
  if (!language) throw new PersonaLanguageMissingError(account.id)
  const now = args.now ?? new Date()
  if (!args.text.trim() || isUndetectableText(args.text)) return { text: args.text, language, converted: false, sourceLanguage: null }

  const [writer, post, rootComments, thread] = await Promise.all([
    prisma.user.findUnique({ where: { id: account.id }, select: { ...PERSON_SELECT, bio: true } }),
    prisma.post.findUnique({
      where: { id: args.postId },
      select: { sourceText: true, imageObjectKey: true, author: { select: PERSON_SELECT } },
    }),
    args.parentId
      ? Promise.resolve([])
      : prisma.postComment.findMany({
          where: { postId: args.postId, parentId: null, ...VISIBLE_COMMENT },
          orderBy: { createdAt: 'desc' },
          take: CONTEXT_ROOT_COMMENTS,
          select: { sourceText: true, author: { select: PERSON_SELECT } },
        }),
    args.parentId
      ? prisma.postComment.findMany({
          where: { OR: [{ id: args.parentId }, { parentId: args.parentId, ...VISIBLE_COMMENT }] },
          orderBy: { createdAt: 'asc' },
          take: CONTEXT_THREAD_REPLIES + 1,
          select: { id: true, authorId: true, sourceText: true, author: { select: PERSON_SELECT } },
        })
      : Promise.resolve([]),
  ])

  const addresseeId = args.replyToUserId
    ?? (args.parentId ? thread.find((comment) => comment.id === args.parentId)?.authorId ?? null : post?.author.id ?? null)
  const addresseeRow = addresseeId
    ? [post?.author, ...thread.map((comment) => comment.author)].find((row) => row?.id === addresseeId)
      ?? await prisma.user.findUnique({ where: { id: addresseeId }, select: PERSON_SELECT })
    : null

  return convertCommentDraft({
    draft: args.text,
    targetLanguage: language,
    writer: { ...person(writer, now, account.id), bio: writer?.bio?.trim() || null },
    addressee: addresseeRow && addresseeRow.id !== account.id ? person(addresseeRow, now, account.id) : null,
    post: { author: person(post?.author, now, account.id), text: clip(post?.sourceText), hasPhoto: Boolean(post?.imageObjectKey) },
    thread: thread.map((comment) => ({ author: person(comment.author, now, account.id), text: clip(comment.sourceText) })).filter((comment) => comment.text),
    otherComments: [...rootComments].reverse().map((comment) => ({ author: person(comment.author, now, account.id), text: clip(comment.sourceText) })).filter((comment) => comment.text),
  }, { now, generate: args.generate })
}
