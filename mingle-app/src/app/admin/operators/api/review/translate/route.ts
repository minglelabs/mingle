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
 * review -> `{ language: 'ko', text }`, Korean for staff the way the app's
 * flag chips translate a post. Nothing is stored on the post.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as { id?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!/^[\w-]{1,64}$/.test(id)) return json({ error: 'invalid_id' }, 400)

  const row = await prisma.operatorPostReserve.findUnique({
    where: { id },
    select: { text: true, language: true, operatorUser: { select: { primaryLanguages: true } } },
  })
  if (!row) return json({ error: 'not_found' }, 404)

  // A post without its own language is written in the account's first language.
  const sourceLanguage = row.language ?? row.operatorUser.primaryLanguages[0] ?? ''
  const translations = await translateForStaff([{ messageId: `reserve-${id}`, text: row.text, sourceLanguage }])
  const text = translations[`reserve-${id}`]
  if (!text) return json({ error: 'translate_failed' }, 502)
  return json({ language: STAFF_TRANSLATION_LANGUAGE, text })
}
