import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/server/admin/guard'
import { STAFF_TRANSLATION_LANGUAGE, translateForStaff } from '@/server/operator-inbox/staff-translate'
import { reviewTranslationsFor, withReviewTranslation } from '@/server/operator-post-reserve/review-translations'
import { translatePostBodySettled } from '@/server/translation/post-translation-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/review/translate — `{ id }` of a post waiting for
 * review, or `{ kind: 'profile', id }` of an account for its bio ->
 * `{ language: 'ko', text }`, Korean for staff the way the app's flag chips
 * translate. A post's translation is kept and becomes its Korean translation
 * when published; a bio's is not stored.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as { id?: unknown; kind?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!/^[\w-]{1,64}$/.test(id)) return json({ error: 'invalid_id' }, 400)

  if (body?.kind === 'profile') {
    const user = await prisma.user.findUnique({ where: { id }, select: { bio: true, primaryLanguages: true } })
    if (!user?.bio) return json({ error: 'not_found' }, 404)
    const messageId = `bio-${id}`
    const translations = await translateForStaff([{ messageId, text: user.bio, sourceLanguage: user.primaryLanguages[0] ?? '' }])
    const text = translations[messageId]
    if (!text) return json({ error: 'translate_failed' }, 502)
    return json({ language: STAFF_TRANSLATION_LANGUAGE, text })
  }

  const row = await prisma.operatorPostReserve.findUnique({
    where: { id },
    select: { text: true, language: true, translations: true, operatorUser: { select: { primaryLanguages: true } } },
  })
  if (!row) return json({ error: 'not_found' }, 404)
  const kept = reviewTranslationsFor(row.translations, row.text).find((entry) => entry.language === STAFF_TRANSLATION_LANGUAGE)
  if (kept) return json({ language: STAFF_TRANSLATION_LANGUAGE, text: kept.text })

  // Translated the way a published post is, and kept on the row: publishing
  // uses it as the post's Korean translation instead of translating again.
  // A post without its own language is written in the account's first language.
  const sourceLanguage = row.language ?? row.operatorUser.primaryLanguages[0] ?? 'auto'
  const [settled] = await translatePostBodySettled({ sourceText: row.text, sourceLanguage, targetLanguages: [STAFF_TRANSLATION_LANGUAGE] })
  const text = settled?.status === 'ready' ? settled.text : null
  if (!text) return json({ error: 'translate_failed' }, 502)
  await prisma.operatorPostReserve.updateMany({
    where: { id, text: row.text },
    data: { translations: withReviewTranslation(row.translations, STAFF_TRANSLATION_LANGUAGE, text, row.text) },
  })
  return json({ language: STAFF_TRANSLATION_LANGUAGE, text })
}
