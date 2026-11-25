import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/server/admin/guard'
import { STAFF_TRANSLATION_LANGUAGE, translateForStaff } from '@/server/operator-inbox/staff-translate'
import { reviewTranslationsFor, withReviewTranslation } from '@/server/operator-post-reserve/review-translations'
import { translatePostBodySettled } from '@/server/translation/post-translation-service'
import { operatorTextProvider } from '@/server/translation/translate-texts'
import { canonicalizeSttLanguageCode } from '@/lib/stt-languages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/review/translate — `{ id, language? }` of a post
 * waiting for review, or `{ kind: 'profile', id, language? }` of an account
 * for its bio -> `{ language, text }`, the way the app's flag chips translate.
 * `language` defaults to Korean; staff read Korean posts in other languages
 * too. A post's translation is kept and becomes its translation into that
 * language when published; a bio's is not stored.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as { id?: unknown; kind?: unknown; language?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!/^[\w-]{1,64}$/.test(id)) return json({ error: 'invalid_id' }, 400)
  const target = body?.language === undefined ? STAFF_TRANSLATION_LANGUAGE : typeof body.language === 'string' ? canonicalizeSttLanguageCode(body.language) : ''
  if (!target) return json({ error: 'invalid_language' }, 400)

  if (body?.kind === 'profile') {
    const user = await prisma.user.findUnique({ where: { id }, select: { bio: true, primaryLanguages: true } })
    if (!user?.bio) return json({ error: 'not_found' }, 404)
    if (target === STAFF_TRANSLATION_LANGUAGE) {
      const messageId = `bio-${id}`
      const translations = await translateForStaff([{ messageId, text: user.bio, sourceLanguage: user.primaryLanguages[0] ?? '' }])
      const text = translations[messageId]
      if (!text) return json({ error: 'translate_failed' }, 502)
      return json({ language: target, text })
    }
    const [bio] = await translatePostBodySettled({ sourceText: user.bio, sourceLanguage: user.primaryLanguages[0] ?? 'auto', targetLanguages: [target], provider: operatorTextProvider() })
    if (bio?.status !== 'ready' || !bio.text) return json({ error: 'translate_failed' }, 502)
    return json({ language: target, text: bio.text })
  }

  const row = await prisma.operatorPostReserve.findUnique({
    where: { id },
    select: { text: true, language: true, translations: true, operatorUser: { select: { primaryLanguages: true } } },
  })
  if (!row) return json({ error: 'not_found' }, 404)
  const kept = reviewTranslationsFor(row.translations, row.text).find((entry) => entry.language === target)
  if (kept) return json({ language: target, text: kept.text })

  // Translated the way a published post is, and kept on the row: publishing
  // uses it as the post's Korean translation instead of translating again.
  // A post without its own language is written in the account's first language.
  const sourceLanguage = row.language ?? row.operatorUser.primaryLanguages[0] ?? 'auto'
  const [settled] = await translatePostBodySettled({ sourceText: row.text, sourceLanguage, targetLanguages: [target], provider: operatorTextProvider() })
  const text = settled?.status === 'ready' ? settled.text : null
  if (!text) return json({ error: 'translate_failed' }, 502)
  await prisma.operatorPostReserve.updateMany({
    where: { id, text: row.text },
    data: { translations: withReviewTranslation(row.translations, target, text, row.text) },
  })
  return json({ language: target, text })
}
