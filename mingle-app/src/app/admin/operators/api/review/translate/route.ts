import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/server/admin/guard'
import { STAFF_TRANSLATION_LANGUAGE, translateForStaff } from '@/server/operator-inbox/staff-translate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/review/translate — `{ id }` of a post waiting for
 * review, or `{ kind: 'profile', id }` of an account for its bio ->
 * `{ language: 'ko', text }`, Korean for staff the way the app's flag chips
 * translate. Nothing is stored.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as { id?: unknown; kind?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!/^[\w-]{1,64}$/.test(id)) return json({ error: 'invalid_id' }, 400)

  let source: { messageId: string; text: string; sourceLanguage: string } | null = null
  if (body?.kind === 'profile') {
    const user = await prisma.user.findUnique({ where: { id }, select: { bio: true, primaryLanguages: true } })
    if (user?.bio) source = { messageId: `bio-${id}`, text: user.bio, sourceLanguage: user.primaryLanguages[0] ?? '' }
  } else {
    const row = await prisma.operatorPostReserve.findUnique({
      where: { id },
      select: { text: true, language: true, operatorUser: { select: { primaryLanguages: true } } },
    })
    // A post without its own language is written in the account's first language.
    if (row) source = { messageId: `reserve-${id}`, text: row.text, sourceLanguage: row.language ?? row.operatorUser.primaryLanguages[0] ?? '' }
  }
  if (!source) return json({ error: 'not_found' }, 404)

  const translations = await translateForStaff([source])
  const text = translations[source.messageId]
  if (!text) return json({ error: 'translate_failed' }, 502)
  return json({ language: STAFF_TRANSLATION_LANGUAGE, text })
}
