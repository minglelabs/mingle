import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  isMessageSenderBlockedInConversation,
  listChannelMemberUserIdsBySessionKey,
  listConversationMembersForUser,
  materializePendingConversationInvitees,
  type ConversationMemberSummary,
} from '@/lib/app-conversations'
import { canonicalizeSttLanguageCode, sanitizeSttLanguageSelection, sanitizeSttLanguageUnion } from '@/lib/stt-languages'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { normalizeChineseContent } from '@/server/chinese-script-conversion'
import { notifyConversationMessage } from '@/server/conversation-realtime'
import { notifyOperatorInboxActivity } from '@/server/operator-inbox/notify'
import { requireOperatorAccount, type OperatorAccountRecord } from '@/server/operators/operator-guard'
import { sendPushNotificationForConversationMessage } from '@/server/push-notifications'
import { translateTexts, type TranslateTextsResult, type TranslationUsage } from '@/server/translation/translate-texts'

/**
 * Operator replies from the admin inbox (contract §5 "Reply language"):
 * staff type in any language, the persona's `primaryLanguages[0]` rendering
 * becomes the message SOURCE, every other room language is translated from
 * the staff original, and the original itself is kept only in the
 * `inbox.reply` audit row. A reply whose persona-language translation fails
 * is refused with a retryable error; the staff original is never stored as
 * SOURCE.
 *
 * Built on the same exported helpers as the app's send path
 * (log-client-event-handler.ts) instead of a shared persistence core: that
 * handler upserts SOURCE / TRANSLATION_FINAL outside its message transaction
 * and in two phases (source first, translations in a later
 * `translationUpdate`), which the admin path must not do, so one shared core
 * would change the handler's behavior and its tests. Admin sends never write
 * tracked activity, event logs or analytics.
 */
export const OPERATOR_REPLY_MAX_LENGTH = 2000
export const OPERATOR_REPLY_SOURCE = 'operator_reply'
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/
const REALTIME_PUBLISH_TIMEOUT_MS = 3000

export type OperatorSendErrorCode =
  | 'empty_text'
  | 'text_too_long'
  | 'invalid_request_id'
  | 'operator_inactive'
  | 'conversation_not_found'
  | 'not_member'
  | 'blocked'
  | 'no_recipients'
  | 'persona_language_missing'
  | 'message_conflict'
  | 'translation_failed'

const ERROR_STATUS: Record<OperatorSendErrorCode, number> = {
  empty_text: 400,
  text_too_long: 400,
  invalid_request_id: 400,
  operator_inactive: 403,
  not_member: 403,
  blocked: 403,
  conversation_not_found: 404,
  no_recipients: 409,
  persona_language_missing: 409,
  message_conflict: 409,
  translation_failed: 503,
}

export class OperatorSendError extends Error {
  readonly code: OperatorSendErrorCode
  readonly status: number
  /** Safe to send again with the same clientRequestId (nothing was stored). */
  readonly retryable: boolean

  constructor(code: OperatorSendErrorCode, options?: { cause?: unknown }) {
    super(code, options)
    this.name = 'OperatorSendError'
    this.code = code
    this.status = ERROR_STATUS[code]
    this.retryable = code === 'translation_failed'
  }
}

/** The stored reply in the room hydration's utterance shape (plus the badge). */
export type OperatorReplyUtterance = {
  id: string
  originalText: string
  originalLang: string
  targetLanguages: string[]
  translations: Record<string, string>
  translationFinalized: Record<string, boolean>
  createdAtMs: number
  serverCreatedAtMs: number
  serverMessageId: string
  speaker: null
  speakerAvatarSeed: null
  speakerAvatarIndex: null
  speakerName: string | null
  speakerUserId: string
  speakerImage: string | null
  speakerBadge: 'operator'
}

export type SendOperatorMessageInput = {
  operatorUserId: string
  conversationId: string
  text: string
  /** Client id of this composed message; a retry with the same id never sends twice. */
  clientRequestId?: string | null
}

export type SendOperatorMessageResult = {
  /** True when this request id had already been sent (a retry); nothing new went out. */
  duplicate: boolean
  messageId: string
  clientMessageId: string
  staffLanguage: string | null
  utterance: OperatorReplyUtterance
}

type TranslatedReply = {
  staffLanguage: string | null
  sourceLanguage: string
  sourceText: string
  translations: Record<string, string>
  targetLanguages: string[]
  provider: string | null
  model: string | null
  usage: Required<Pick<TranslationUsage, 'promptTokens' | 'completionTokens' | 'totalTokens'>> | null
}

const inFlightReplies = new Map<string, Promise<SendOperatorMessageResult>>()

/** Newlines kept, other control characters dropped, outer whitespace trimmed. */
export function normalizeStaffReplyText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
}

/** The server's clientMessageId for a reply: `op-` + the client request id. */
export function operatorReplyClientMessageId(requestId: string): string {
  return `op-${requestId}`
}

function resolveClientRequestId(raw: string | null | undefined): string {
  if (raw === undefined || raw === null || raw === '') return randomUUID()
  if (typeof raw !== 'string' || !CLIENT_REQUEST_ID_PATTERN.test(raw)) throw new OperatorSendError('invalid_request_id')
  return raw
}

function sttLanguage(raw: string | null | undefined): string {
  return raw ? canonicalizeSttLanguageCode(raw) : ''
}

/** The source language is the persona's primary language, never a staff/room fallback. */
function resolvePersonaLanguage(operator: OperatorAccountRecord): string | null {
  return sanitizeSttLanguageSelection(operator.primaryLanguages)[0] ?? null
}

function addUsage(total: TranslatedReply['usage'], usage: TranslationUsage | undefined): TranslatedReply['usage'] {
  if (!usage) return total
  const base = total ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  return {
    promptTokens: base.promptTokens + (usage.promptTokens ?? 0),
    completionTokens: base.completionTokens + (usage.completionTokens ?? 0),
    totalTokens: base.totalTokens + (usage.totalTokens ?? 0),
  }
}

/** Model output with canonical language keys (and Chinese in each variant's script). */
function canonicalTranslations(result: TranslateTextsResult, text: string, staffLanguage: string | null, targets: string[]): Record<string, string> {
  const normalized = normalizeChineseContent({
    sourceLanguage: staffLanguage ?? 'unknown',
    sourceText: text,
    translations: result.translations ?? {},
    targetLanguages: targets,
    candidates: targets,
    sourceScriptIsEvidence: true,
  })
  const translations: Record<string, string> = {}
  for (const [language, value] of Object.entries(normalized.translations)) {
    const key = sttLanguage(language) || language
    if (value.trim()) translations[key] = value.trim()
  }
  return translations
}

async function requestTranslation(input: Parameters<typeof translateTexts>[0]): Promise<TranslateTextsResult> {
  try {
    return await translateTexts(input)
  } catch (error) {
    throw new OperatorSendError('translation_failed', { cause: error })
  }
}

/**
 * One model call for the persona language and every room language (with
 * source detection, so staff may write in any language), then one retry for
 * room languages it missed. The persona language is mandatory; a missed
 * other language just leaves those members reading the persona original.
 */
async function translateStaffReply(args: {
  text: string
  personaLanguage: string
  roomLanguages: string[]
}): Promise<TranslatedReply> {
  const { text, personaLanguage } = args
  const targets = sanitizeSttLanguageUnion([personaLanguage, ...args.roomLanguages])
  const first = await requestTranslation({
    text,
    sourceLanguage: 'auto',
    targetLanguages: targets,
    redetectSourceLanguage: true,
    isFinal: true,
  })
  const staffLanguage = canonicalizeTranslationLanguageCode(first.detectedSourceLanguage || '') || null
  const staffSttLanguage = sttLanguage(staffLanguage)
  let usage = addUsage(null, first.usage)
  const collected = canonicalTranslations(first, text, staffLanguage, targets)

  // Staff already wrote in the persona's language: that text is the persona text.
  const personaText = collected[personaLanguage] || (staffSttLanguage === personaLanguage ? text : '')
  if (!personaText) throw new OperatorSendError('translation_failed')

  const otherLanguages = targets.filter((language) => language !== personaLanguage)
  const missing = otherLanguages.filter((language) => !collected[language] && language !== staffSttLanguage)
  if (missing.length > 0) {
    try {
      const retry = await translateTexts({
        text,
        sourceLanguage: staffLanguage || 'auto',
        targetLanguages: missing,
        redetectSourceLanguage: !staffLanguage,
        isFinal: true,
      })
      usage = addUsage(usage, retry.usage)
      const retried = canonicalTranslations(retry, text, staffLanguage, missing)
      for (const language of missing) {
        if (!collected[language] && retried[language]) collected[language] = retried[language]
      }
    } catch {
      // The reply still goes out in the persona language.
    }
  }

  const otherTranslations: Record<string, string> = {}
  for (const language of otherLanguages) {
    // A member reading the staff's own language gets the staff original.
    const value = collected[language] || (language === staffSttLanguage ? text : '')
    if (value) otherTranslations[language] = value
  }

  const normalized = normalizeChineseContent({
    sourceLanguage: personaLanguage,
    sourceText: personaText,
    translations: otherTranslations,
    targetLanguages: targets,
    candidates: targets,
    sourceHint: personaLanguage,
    sourceScriptIsEvidence: true,
  })
  const sourceLanguage = normalized.sourceLanguage || personaLanguage
  // Model output, not typed text: store it already in its variant's script.
  const sourceText = (normalized.sourceDisplayText ?? personaText).trim()
  const translations = Object.fromEntries(
    Object.entries(normalized.translations).filter(([language, value]) => language !== sourceLanguage && value.trim()),
  )
  return {
    staffLanguage,
    sourceLanguage,
    sourceText,
    translations,
    targetLanguages: normalized.targetLanguages,
    provider: first.provider || null,
    model: first.model || null,
    usage,
  }
}

function buildReplyUtterance(args: {
  clientMessageId: string
  messageId: string
  createdAt: Date
  sourceLanguage: string
  sourceText: string
  translations: Record<string, string>
  targetLanguages: string[]
  operator: Pick<OperatorAccountRecord, 'id' | 'name' | 'image'>
}): OperatorReplyUtterance {
  const createdAtMs = args.createdAt.getTime()
  return {
    id: args.clientMessageId,
    originalText: args.sourceText,
    originalLang: args.sourceLanguage,
    targetLanguages: [...args.targetLanguages],
    translations: { ...args.translations },
    translationFinalized: Object.fromEntries(Object.keys(args.translations).map((language) => [language, true])),
    createdAtMs,
    serverCreatedAtMs: createdAtMs,
    serverMessageId: args.messageId,
    speaker: null,
    speakerAvatarSeed: null,
    speakerAvatarIndex: null,
    speakerName: args.operator.name ?? null,
    speakerUserId: args.operator.id,
    speakerImage: args.operator.image ?? null,
    speakerBadge: 'operator',
  }
}

/** The live committed utterance, in exactly the shape the app's send path publishes (plus `speakerBadge`). */
function toLiveUtterance(utterance: OperatorReplyUtterance): Record<string, unknown> {
  return {
    id: utterance.id,
    originalText: utterance.originalText,
    originalLang: utterance.originalLang,
    translations: utterance.translations,
    translationFinalized: utterance.translationFinalized,
    targetLanguages: utterance.targetLanguages,
    createdAtMs: utterance.createdAtMs,
    serverCreatedAtMs: utterance.serverCreatedAtMs,
    serverMessageId: utterance.serverMessageId,
    speakerUserId: utterance.speakerUserId,
    speakerName: utterance.speakerName,
    speakerImage: utterance.speakerImage,
    speakerBadge: utterance.speakerBadge,
  }
}

function readTargetLanguages(metadata: Prisma.JsonValue | null): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []
  const raw = (metadata as Record<string, unknown>).translationTargetLanguages
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())) : []
}

/** An already stored reply for this request id (a retry), rebuilt from the database. */
async function loadExistingReply(
  sessionKey: string,
  clientMessageId: string,
  operator: OperatorAccountRecord,
): Promise<SendOperatorMessageResult | null> {
  const existing = await prisma.appMessage.findUnique({
    where: { sessionKey_clientMessageId: { sessionKey, clientMessageId } },
    select: {
      id: true,
      userId: true,
      isDeleted: true,
      createdAt: true,
      sourceLanguage: true,
      metadata: true,
      contents: {
        where: { OR: [{ isDeleted: false }, { isDeleted: null }] },
        select: { contentType: true, language: true, text: true },
      },
    },
  })
  if (!existing) return null
  if (existing.userId !== operator.id || existing.isDeleted === true) throw new OperatorSendError('message_conflict')
  const source = existing.contents.find((content) => content.contentType === 'SOURCE' && content.language === existing.sourceLanguage)
    ?? existing.contents.find((content) => content.contentType === 'SOURCE')
  const translations = Object.fromEntries(existing.contents
    .filter((content) => content.contentType === 'TRANSLATION_FINAL' && content.text.trim())
    .map((content) => [content.language, content.text.trim()]))
  return {
    duplicate: true,
    messageId: existing.id,
    clientMessageId,
    staffLanguage: null,
    utterance: buildReplyUtterance({
      clientMessageId,
      messageId: existing.id,
      createdAt: existing.createdAt,
      sourceLanguage: existing.sourceLanguage,
      sourceText: source?.text.trim() ?? '',
      translations,
      targetLanguages: readTargetLanguages(existing.metadata),
      operator,
    }),
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

/**
 * Best-effort delivery after the commit, each step isolated like the app's
 * send path: materialize pending invitees, the realtime publish (full
 * utterance, labeled `speakerBadge: 'operator'`), the real users' push and the
 * operator-inbox notify. None of them can turn a committed reply into a
 * failed send.
 */
async function deliverCommittedReply(args: {
  conversationId: string
  sessionKey: string
  operatorUserId: string
  messageId: string
  createdAt: Date
  sourceText: string
  utterance: OperatorReplyUtterance
}): Promise<void> {
  let committedMemberUserIds: string[] | null = null
  try {
    committedMemberUserIds = await materializePendingConversationInvitees(args.sessionKey, args.createdAt)
  } catch (error) {
    console.error('[operator-inbox] materialize_failed', { error: error instanceof Error ? error.name : 'unknown' })
  }
  const memberUserIds = committedMemberUserIds
    ?? await listChannelMemberUserIdsBySessionKey(args.sessionKey).catch(() => [] as string[])

  try {
    await notifyConversationMessage(args.sessionKey, memberUserIds, toLiveUtterance(args.utterance), {
      timeoutMs: REALTIME_PUBLISH_TIMEOUT_MS,
    })
  } catch (error) {
    console.error('[operator-inbox] realtime_failed', { error: error instanceof Error ? error.name : 'unknown' })
  }
  try {
    await sendPushNotificationForConversationMessage({
      messageId: args.messageId,
      sessionKey: args.sessionKey,
      sourceText: args.sourceText,
      senderUserId: args.operatorUserId,
      memberUserIds,
    })
  } catch (error) {
    console.error('[operator-inbox] push_failed', { error: error instanceof Error ? error.name : 'unknown' })
  }
  try {
    await notifyOperatorInboxActivity({
      sessionKey: args.sessionKey,
      conversationId: args.conversationId,
      senderUserId: args.operatorUserId,
      memberUserIds,
      messageId: args.messageId,
      preview: args.sourceText,
      kind: 'text',
    })
  } catch (error) {
    console.error('[operator-inbox] notify_failed', { error: error instanceof Error ? error.name : 'unknown' })
  }
}

async function composeAndSend(args: {
  ctx: AdminContext
  operator: OperatorAccountRecord
  channel: { id: string; sessionKey: string }
  members: ConversationMemberSummary[]
  text: string
  clientMessageId: string
}): Promise<SendOperatorMessageResult> {
  const { ctx, operator, channel, text, clientMessageId } = args
  const existing = await loadExistingReply(channel.sessionKey, clientMessageId, operator)
  if (existing) return existing

  const personaLanguage = resolvePersonaLanguage(operator)
  if (!personaLanguage) throw new OperatorSendError('persona_language_missing')
  const roomLanguages = sanitizeSttLanguageUnion(args.members.flatMap((member) => member.selectedLanguages), [personaLanguage])
  const reply = await translateStaffReply({ text, personaLanguage, roomLanguages })

  const metadata: Prisma.InputJsonObject = {
    source: OPERATOR_REPLY_SOURCE,
    clientMessageId,
    sourceLanguage: reply.sourceLanguage,
    provider: reply.provider,
    infrastructureProvider: null,
    model: reply.model,
    translationLanguages: Object.keys(reply.translations),
    translationTargetLanguages: reply.targetLanguages,
  }

  let message: { id: string; createdAt: Date }
  try {
    // Message, SOURCE and every TRANSLATION_FINAL land in one commit, so no
    // reader ever sees the reply without its persona-language source.
    message = await prisma.$transaction(async (tx) => {
      const created = await tx.appMessage.create({
        data: {
          userId: operator.id,
          sessionKey: channel.sessionKey,
          clientMessageId,
          isDeleted: false,
          sourceLanguage: reply.sourceLanguage,
          translationProvider: reply.provider ?? undefined,
          translationModel: reply.model ?? undefined,
          translationPromptTokens: reply.usage?.promptTokens,
          translationCompletionTokens: reply.usage?.completionTokens,
          translationTotalTokens: reply.usage?.totalTokens,
          metadata,
        },
        select: { id: true, createdAt: true },
      })
      await tx.appMessageContent.createMany({
        data: [
          {
            messageId: created.id,
            contentType: 'SOURCE',
            language: reply.sourceLanguage,
            isDeleted: false,
            text: reply.sourceText,
            provider: reply.provider ?? undefined,
            model: reply.model ?? undefined,
          },
          ...Object.entries(reply.translations).map(([language, translatedText]) => ({
            messageId: created.id,
            contentType: 'TRANSLATION_FINAL',
            language,
            isDeleted: false,
            text: translatedText,
            provider: reply.provider ?? undefined,
            model: reply.model ?? undefined,
          })),
        ],
      })
      return created
    })
  } catch (error) {
    // A concurrent retry of the same request id won the insert.
    if (isUniqueViolation(error)) {
      const raced = await loadExistingReply(channel.sessionKey, clientMessageId, operator)
      if (raced) return raced
    }
    throw error
  }

  const utterance = buildReplyUtterance({
    clientMessageId,
    messageId: message.id,
    createdAt: message.createdAt,
    sourceLanguage: reply.sourceLanguage,
    sourceText: reply.sourceText,
    translations: reply.translations,
    targetLanguages: reply.targetLanguages,
    operator,
  })

  // Audited right after the commit, so the record exists even if a later
  // delivery step hangs. The staff original lives only here.
  await writeAdminAudit(ctx, {
    action: 'inbox.reply',
    operatorUserId: operator.id,
    targetType: 'message',
    targetId: message.id,
    metadata: {
      conversationId: channel.id,
      clientMessageId,
      staffOriginal: text,
      staffLanguage: reply.staffLanguage,
      sourceLanguage: reply.sourceLanguage,
      translationLanguages: Object.keys(reply.translations),
    },
  })

  await deliverCommittedReply({
    conversationId: channel.id,
    sessionKey: channel.sessionKey,
    operatorUserId: operator.id,
    messageId: message.id,
    createdAt: message.createdAt,
    sourceText: reply.sourceText,
    utterance,
  })

  return {
    duplicate: false,
    messageId: message.id,
    clientMessageId,
    staffLanguage: reply.staffLanguage,
    utterance,
  }
}

/**
 * Sends `text` into the room AS the operator account. Throws
 * `OperatorAccountRequiredError` for a non-operator id and
 * `OperatorSendError` (with an HTTP status) for everything the caller should
 * show; a retry with the same `clientRequestId` returns the stored reply
 * (`duplicate: true`) instead of sending twice.
 */
export async function sendOperatorMessage(ctx: AdminContext, input: SendOperatorMessageInput): Promise<SendOperatorMessageResult> {
  const text = normalizeStaffReplyText(input.text)
  if (!text) throw new OperatorSendError('empty_text')
  if (text.length > OPERATOR_REPLY_MAX_LENGTH) throw new OperatorSendError('text_too_long')
  const requestId = resolveClientRequestId(input.clientRequestId)

  const operator = await requireOperatorAccount(input.operatorUserId)
  if (!operator.isActive) throw new OperatorSendError('operator_inactive')

  const conversationId = typeof input.conversationId === 'string' ? input.conversationId.trim() : ''
  const channel = conversationId
    ? await prisma.appConversationChannel.findFirst({
        where: { id: conversationId, OR: [{ isDeleted: false }, { isDeleted: null }] },
        select: { id: true, sessionKey: true },
      })
    : null
  if (!channel) throw new OperatorSendError('conversation_not_found')

  // Active (materialized, not departed) membership, and no block.
  const members = await listConversationMembersForUser({ conversationId: channel.id, userId: operator.id })
  if (!members) throw new OperatorSendError('not_member')
  if (await isMessageSenderBlockedInConversation({ sessionKey: channel.sessionKey, userId: operator.id })) {
    throw new OperatorSendError('blocked')
  }
  if (!members.some((member) => member.userId !== operator.id)) throw new OperatorSendError('no_recipients')

  const clientMessageId = operatorReplyClientMessageId(requestId)
  const flightKey = `${channel.sessionKey}\u0000${clientMessageId}`
  const running = inFlightReplies.get(flightKey)
  if (running) return { ...(await running), duplicate: true }

  const promise = composeAndSend({ ctx, operator, channel, members, text, clientMessageId })
  inFlightReplies.set(flightKey, promise)
  try {
    return await promise
  } finally {
    if (inFlightReplies.get(flightKey) === promise) inFlightReplies.delete(flightKey)
  }
}
