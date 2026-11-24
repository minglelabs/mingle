import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { isReferenceKind, removeReferencePhoto, updateReferenceTags, type ReferenceGender, type ReferenceKind } from '@/server/reference-library/library'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** PATCH `{ gender?: 'female' | 'male' | null, kind?: 'thing' | 'face' | 'person' | 'group', note?: string | null }`. */
export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { id } = await context.params
  const body = await request.json().catch(() => null) as { gender?: unknown; kind?: unknown; note?: unknown } | null
  if (!body) return json({ error: 'invalid_body' }, 400)
  const tags: { gender?: ReferenceGender | null; kind?: ReferenceKind; note?: string | null } = {}
  if ('gender' in body) tags.gender = body.gender === 'female' || body.gender === 'male' ? body.gender : null
  if (isReferenceKind(body.kind)) tags.kind = body.kind
  if ('note' in body) tags.note = typeof body.note === 'string' ? body.note : null
  return (await updateReferenceTags(id, tags)) ? json({ ok: true }) : json({ error: 'not_found' }, 404)
}

/** DELETE: removes the photo from the library and storage. */
export async function DELETE(_request: Request, context: Ctx) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { id } = await context.params
  const removed = await removeReferencePhoto(id)
  if (removed) await writeAdminAudit(auth.ctx, { action: 'reference.remove', targetType: 'reference_library', targetId: id })
  return removed ? json({ ok: true }) : json({ error: 'not_found' }, 404)
}
