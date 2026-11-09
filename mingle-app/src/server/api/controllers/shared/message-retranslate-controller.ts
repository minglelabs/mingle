import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getConversationSessionKeyForMember, listChannelMemberUserIdsBySessionKey } from '@/lib/app-conversations'
import { COIN_INSUFFICIENT_ERROR } from '@/lib/coin-units'
import { readMessageRecalledAtMs } from '@/lib/message-recall'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import {
  normalizeSelectableTranslationModel,
  resolveDefaultSelectableTranslationModel,
} from '@/lib/translation-models'
import { normalizeChineseContent } from '@/server/chinese-script-conversion'
import { resolveCoinBillingUserId } from '@/server/coins/request-billing'
import { canSpendCoins, chargeCoinUsageSafely } from '@/server/coins/wallet'
import { notifyConversationMessage } from '@/server/conversation-realtime'
import { isPhotoMessageMetadata } from '@/server/operator-inbox/staff-translate'
import { resolveTranslationProviderConfig, translateTexts } from '@/server/translation/translate-texts'
import { messageIdentity } from './message-reaction-controller'

const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/

function isLiveContent(content: { isDeleted: boolean | null }): boolean {
  return content.isDeleted !== true
}

// Translates one message again into one language and replaces the stored
// translation for everyone in the room (a message keeps one translation per
// language). The caller pays like an ordinary translation and their own
// translation model is used.
export async function retranslateConversationMessage(request: NextRequest, conversationId: string) {
  const session = await getServerSession(getAuthOptions())
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sessionKey = await getConversationSessionKeyForMember({ conversationId, userId })
  if (!sessionKey) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const messageId = body?.messageId
  if (typeof messageId !== 'string' || !messageId || messageId.length > 256) {
    return NextResponse.json({ error: 'invalid_message_id' }, { status: 400 })
  }
  const language = canonicalizeTranslationLanguageCode(typeof body?.language === 'string' ? body.language : '')
  if (!language) return NextResponse.json({ error: 'invalid_language' }, { status: 400 })
  const requestId = typeof body?.requestId === 'string' && REQUEST_ID_PATTERN.test(body.requestId)
    ? body.requestId : randomUUID()

  const message = await prisma.appMessage.findFirst({
    where: { sessionKey, AND: [messageIdentity([messageId])] },
    select: {
      id: true,
      clientMessageId: true,
      isDeleted: true,
      sourceLanguage: true,
      metadata: true,
      contents: { where: { contentType: 'SOURCE' }, select: { text: true, language: true, isDeleted: true } },
    },
  })
  if (!message || message.isDeleted || readMessageRecalledAtMs(message.metadata) !== null) {
    return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
  }
  if (isPhotoMessageMetadata(message.metadata)) {
    return NextResponse.json({ error: 'not_retranslatable' }, { status: 400 })
  }
  const source = message.contents.find(isLiveContent)
  const sourceText = source?.text.trim() ?? ''
  if (!sourceText) return NextResponse.json({ error: 'not_retranslatable' }, { status: 400 })
  const sourceLanguage = message.sourceLanguage || source?.language || 'unknown'
  if (canonicalizeTranslationLanguageCode(sourceLanguage) === language) {
    return NextResponse.json({ error: 'same_language' }, { status: 400 })
  }

  const coinBillingUserId = await resolveCoinBillingUserId()
  if (coinBillingUserId && !(await canSpendCoins(coinBillingUserId))) {
    return NextResponse.json({ error: COIN_INSUFFICIENT_ERROR }, { status: 402 })
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { translationModel: true } })
  const modelSelection = normalizeSelectableTranslationModel(user?.translationModel)
    ?? resolveDefaultSelectableTranslationModel()
  const providerResolution = resolveTranslationProviderConfig(modelSelection)
  if (!providerResolution.ok) return NextResponse.json({ error: 'translation_unavailable' }, { status: 503 })

  let translated = ''
  let servedModel: string | null = null
  try {
    const result = await translateTexts({
      text: sourceText,
      sourceLanguage,
      targetLanguages: [language],
      modelSelection,
      isFinal: true,
    })
    servedModel = result.model
    const normalized = normalizeChineseContent({
      sourceLanguage,
      sourceText,
      translations: result.translations,
      targetLanguages: [language],
      candidates: [language],
    })
    translated = normalized.translations[language]?.trim() ?? ''
  } catch (error) {
    // Never log the message text.
    console.warn('[retranslate] translation_failed', { error: error instanceof Error ? error.name : 'unknown' })
  }
  if (!translated) return NextResponse.json({ error: 'translation_failed' }, { status: 502 })

  const providerConfig = providerResolution.config
  const stored = await prisma.$transaction(async tx => {
    // Same lock as the finalize upsert and the recall: a recall landing now
    // either commits first (and this write is dropped) or sees this write.
    if (message.clientMessageId) {
      const lockKey = JSON.stringify([sessionKey, message.clientMessageId])
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
    }
    const current = await tx.appMessage.findUnique({ where: { id: message.id }, select: { isDeleted: true, metadata: true } })
    if (!current || current.isDeleted || readMessageRecalledAtMs(current.metadata) !== null) return false
    await tx.appMessageContent.upsert({
      where: { messageId_contentType_language: { messageId: message.id, contentType: 'TRANSLATION_FINAL', language } },
      create: {
        messageId: message.id,
        contentType: 'TRANSLATION_FINAL',
        language,
        isDeleted: false,
        text: translated,
        provider: providerConfig.infrastructureProvider,
        model: servedModel ?? providerConfig.model,
        metadata: { retranslatedAtMs: Date.now(), retranslatedByUserId: userId },
      },
      update: {
        isDeleted: false,
        text: translated,
        provider: providerConfig.infrastructureProvider,
        model: servedModel ?? providerConfig.model,
        metadata: { retranslatedAtMs: Date.now(), retranslatedByUserId: userId },
      },
    })
    return true
  })
  if (!stored) return NextResponse.json({ error: 'message_not_found' }, { status: 404 })

  let coinBalance: number | undefined
  if (coinBillingUserId) {
    const charge = await chargeCoinUsageSafely({
      userId: coinBillingUserId,
      kind: 'translation',
      units: { message: 1 },
      model: providerConfig.model,
      provider: providerConfig.infrastructureProvider,
      servedModel,
      sessionKey,
      conversationId,
      messageId: message.id,
      idempotencyKey: `retranslation:${coinBillingUserId}:${message.id}:${language}:${requestId}`,
    })
    if (charge?.wallet) coinBalance = charge.wallet.balance
  }

  // Open rooms pick up the new translation on their next hydration.
  const members = await listChannelMemberUserIdsBySessionKey(sessionKey)
  await notifyConversationMessage(sessionKey, members, undefined, { timeoutMs: 3000 })
  return NextResponse.json({
    ok: true,
    messageId,
    language,
    text: translated,
    ...(coinBalance !== undefined ? { coinBalance } : {}),
  })
}
