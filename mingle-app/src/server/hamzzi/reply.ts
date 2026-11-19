import { SchemaType, type ResponseSchema } from '@google/generative-ai'
import { prisma } from '@/lib/prisma'
import { HAMZZI_USER_ID } from '@/lib/hamzzi'
import { zipInterestLanguages } from '@/lib/interest-languages'
import { canonicalizeSttLanguageCode, sanitizeSttLanguageSelection } from '@/lib/stt-languages'
import { generateJson, type GenerateJsonRequest } from '@/server/llm/generate-json'
import { isPhotoMessageMetadata } from '@/server/operator-inbox/staff-translate'
import { HAMZZI_SYSTEM_PROMPT } from './prompt'

/**
 * Writes Hamzzi's next message in a one-to-one room: a language-practice
 * buddy that also explains HashChat. Always on the Anthropic API (Claude
 * Sonnet 5.5), never the ChatGPT pool (staff decided 2026-11-19).
 */
export const HAMZZI_TRANSCRIPT_TURNS = 30
export const HAMZZI_MAX_REPLY_CHARS = 800
const MESSAGE_MAX_CHARS = 1000
const CALL_TIMEOUT_MS = 90_000
export const HAMZZI_DEFAULT_MODEL = 'claude-sonnet-5-5'

export type HamzziReplyContext = {
  profile: {
    name: string | null
    primaryLanguages: string[]
    interestLanguages: Array<{ language: string; level: number }>
  }
  /** The user's own language: app questions are answered in it. */
  nativeLanguage: string
  /** The language Hamzzi chats in unless the user asks for another one. */
  practiceLanguage: string
  counterpartName: string | null
  /** Oldest first; `me` is Hamzzi. */
  transcript: Array<{ from: 'me' | 'them'; at: string; text: string }>
}

export type HamzziReply = {
  kind: 'app_help' | 'chat'
  /** Language the reply is written in: the message's source language. */
  language: string
  /** Empty when the model leaves the message alone (sensitive content). */
  text: string
}

function clip(raw: string | null | undefined, max: number): string {
  const text = (raw ?? '').trim()
  const characters = Array.from(text)
  return characters.length > max ? `${characters.slice(0, max).join('')}…` : text
}

/** The context for the room with `userId`, or null when there is nothing to answer. */
export async function loadHamzziReplyContext(args: { sessionKey: string; userId: string }): Promise<HamzziReplyContext | null> {
  const [user, messages] = await Promise.all([
    prisma.user.findFirst({
      where: { id: args.userId, isDeleted: false },
      select: {
        name: true,
        handle: true,
        primaryLanguages: true,
        interestLanguages: true,
        interestLanguageLevels: true,
        defaultDisplayLanguage: true,
        defaultConversationLanguages: true,
      },
    }),
    prisma.appMessage.findMany({
      where: { sessionKey: args.sessionKey, OR: [{ isDeleted: false }, { isDeleted: null }] },
      orderBy: { createdAt: 'desc' },
      take: HAMZZI_TRANSCRIPT_TURNS,
      select: {
        userId: true,
        createdAt: true,
        sourceLanguage: true,
        metadata: true,
        contents: {
          where: { contentType: 'SOURCE', OR: [{ isDeleted: false }, { isDeleted: null }] },
          select: { language: true, text: true },
        },
      },
    }),
  ])
  if (!user) return null

  const primaryLanguages = sanitizeSttLanguageSelection(user.primaryLanguages)
  const nativeLanguage = primaryLanguages[0]
    || canonicalizeSttLanguageCode(user.defaultDisplayLanguage ?? '')
    || sanitizeSttLanguageSelection(user.defaultConversationLanguages)[0]
    || 'en'
  const interests = zipInterestLanguages(user.interestLanguages, user.interestLanguageLevels)

  const transcript: HamzziReplyContext['transcript'] = []
  for (const message of messages.reverse()) {
    if (!message.userId) continue
    const source = message.contents.find((content) => content.language === message.sourceLanguage) ?? message.contents[0]
    const text = isPhotoMessageMetadata(message.metadata) ? '[photo]' : clip(source?.text, MESSAGE_MAX_CHARS)
    if (!text) continue
    transcript.push({ from: message.userId === HAMZZI_USER_ID ? 'me' : 'them', at: message.createdAt.toISOString(), text })
  }
  if (!transcript.some((turn) => turn.from === 'them')) return null

  return {
    profile: {
      name: user.name?.trim() || null,
      primaryLanguages,
      interestLanguages: interests.map((entry) => ({ language: entry.code, level: entry.level })),
    },
    nativeLanguage,
    practiceLanguage: interests[0]?.code ?? nativeLanguage,
    counterpartName: user.name?.trim() || user.handle || null,
    transcript,
  }
}

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    kind: { type: SchemaType.STRING, format: 'enum', enum: ['app_help', 'chat'] },
    replyLanguage: { type: SchemaType.STRING },
    reply: { type: SchemaType.STRING },
  },
  required: ['kind', 'replyLanguage', 'reply'],
}

type RawReply = { kind: 'app_help' | 'chat'; replyLanguage: string; reply: string }

export function validateHamzziReply(value: unknown): RawReply {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_reply')
  const record = value as Record<string, unknown>
  if (typeof record.reply !== 'string') throw new Error('invalid_reply')
  const reply = record.reply.replace(/\r\n?/g, '\n').trim()
  if (Array.from(reply).length > HAMZZI_MAX_REPLY_CHARS) throw new Error('reply_too_long')
  return {
    kind: record.kind === 'app_help' ? 'app_help' : 'chat',
    replyLanguage: typeof record.replyLanguage === 'string' ? record.replyLanguage : '',
    reply,
  }
}

type GenerateFn = <T>(request: GenerateJsonRequest<T>) => Promise<T>

/** One model call. Throws `LlmError`; an empty `text` means "leave this one alone". */
export async function generateHamzziReply(context: HamzziReplyContext, deps: { generate?: GenerateFn } = {}): Promise<HamzziReply> {
  const generate = deps.generate ?? generateJson
  const raw = await generate({
    instructions: HAMZZI_SYSTEM_PROMPT,
    input: context,
    responseSchema: RESPONSE_SCHEMA,
    validate: validateHamzziReply,
    model: process.env.HAMZZI_REPLY_MODEL?.trim() || HAMZZI_DEFAULT_MODEL,
    provider: 'direct',
    temperature: 0.8,
    maxOutputTokens: 1024,
    timeoutMs: CALL_TIMEOUT_MS,
  })
  const fallback = raw.kind === 'app_help' ? context.nativeLanguage : context.practiceLanguage
  return {
    kind: raw.kind,
    language: canonicalizeSttLanguageCode(raw.replyLanguage) || fallback,
    text: raw.reply,
  }
}
