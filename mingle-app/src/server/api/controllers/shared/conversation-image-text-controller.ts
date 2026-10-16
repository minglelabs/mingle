import { after, NextRequest, NextResponse } from 'next/server'
import { listConversationTranslationLanguagesBySessionKey } from '@/lib/app-conversations'
import {
  normalizeImageTextLanguage,
  normalizeImageTextLanguageList,
  type ConversationImageTextResponse,
} from '@/lib/conversation-image-text'
import { prisma } from '@/lib/prisma'
import { COIN_INSUFFICIENT_ERROR } from '@/lib/coin-units'
import { resolveCoinBillingMode } from '@/server/coins/config'
import { canSpendCoins } from '@/server/coins/wallet'
import {
  isConversationImageTextEnabled,
  readConversationImageTextState,
  runConversationImageTextJob,
  runConversationImageTextTranslations,
} from '@/server/conversation-image-text'
import { authorizeConversationImageScope, readStoredConversationImage } from './conversation-image-access'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }
// A few language codes; anything longer is not a request our client makes.
const MAX_LANGUAGES_PARAM_LENGTH = 256

function textResponse(body: ConversationImageTextResponse) {
  return NextResponse.json(body, { headers: NO_STORE_HEADERS })
}

/**
 * GET .../images/{messageId}/text?languages=ko,en
 *
 * The photo's OCR blocks and their translations in the contract shape of
 * src/lib/conversation-image-text.ts. `languages` = requested ∩ (room
 * languages ∪ the viewer's display language), in request order; absent means
 * the room languages. Missing work (OCR for a photo sent before this feature,
 * a stale or failed-under-limit attempt, a missing translation) is scheduled
 * with after() and claimed in the DB, so repeated polls are idempotent.
 */
export async function readConversationImageText(request: NextRequest, conversationId: string, messageId: string) {
  const scope = await authorizeConversationImageScope(conversationId, request)
  if (scope instanceof NextResponse) return scope
  // Same visibility rules as readConversationImage: this room, not deleted, a stored photo.
  const message = await prisma.appMessage.findFirst({
    where: { id: messageId, sessionKey: scope.sessionKey, OR: [{ isDeleted: null }, { isDeleted: false }] },
    select: { metadata: true },
  })
  const image = readStoredConversationImage(message?.metadata)
  if (!image) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!isConversationImageTextEnabled()) return textResponse({ status: 'disabled', blocks: [], translations: [] })

  const rawLanguages = request.nextUrl.searchParams.get('languages')
  if (rawLanguages !== null && rawLanguages.length > MAX_LANGUAGES_PARAM_LENGTH) {
    return NextResponse.json({ error: 'invalid_languages' }, { status: 400 })
  }
  const requested = rawLanguages?.trim() ? normalizeImageTextLanguageList(rawLanguages) : null
  if (requested && requested.length === 0) return NextResponse.json({ error: 'invalid_languages' }, { status: 400 })

  let state
  try {
    const room = await listConversationTranslationLanguagesBySessionKey(scope.sessionKey, scope.userId)
    const allowed = new Set(
      [...room.languages, room.viewerDisplayLanguage].map(language => normalizeImageTextLanguage(language)).filter(Boolean),
    )
    const languages = requested
      ? requested.filter(language => allowed.has(language))
      : normalizeImageTextLanguageList(room.languages)
    state = await readConversationImageTextState(messageId, languages)
  } catch (error) {
    console.error('[conversation-image-text] read failed', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ error: 'image_text_unavailable' }, { status: 503, headers: NO_STORE_HEADERS })
  }

  // Coins (docs/coin-iap-spec.md 4.3): the viewer who asks for new OCR/translation
  // work pays for it. Reading results that already exist stays free.
  if (state.runImageJob || state.translateLanguages.length) {
    const billedUserId = resolveCoinBillingMode() === 'off' ? null : scope.userId
    if (billedUserId && !(await canSpendCoins(billedUserId))) {
      return NextResponse.json({ error: COIN_INSUFFICIENT_ERROR }, { status: 402, headers: NO_STORE_HEADERS })
    }
    if (state.runImageJob) {
      const job = { messageId, sessionKey: scope.sessionKey, imageSha256: image.sha256, objectKey: image.objectKey, billedUserId }
      after(() => runConversationImageTextJob(job))
    }
    if (state.translateLanguages.length) {
      const languages = state.translateLanguages
      after(() => runConversationImageTextTranslations({ messageId, languages, billedUserId, sessionKey: scope.sessionKey }))
    }
  }
  return textResponse(state.response)
}
