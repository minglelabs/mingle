import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

function getViewerId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
}

/** GET — list drafts, newest-updated first */
export async function GET(request: NextRequest) {
  const userId = getViewerId(await getServerSession(getAuthOptions()))
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const rawLimit = Number(request.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(MAX_LIMIT, Math.floor(rawLimit)) : DEFAULT_LIMIT

  const drafts = await prisma.postDraft.findMany({
    where: { authorId: userId },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })

  return json({ drafts })
}

/** POST — create a new draft */
export async function POST(request: NextRequest) {
  const userId = getViewerId(await getServerSession(getAuthOptions()))
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_body' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const input = body as Record<string, unknown>
  const sourceText = typeof input.sourceText === 'string' ? input.sourceText : null
  const backgroundKey = typeof input.backgroundKey === 'string' ? input.backgroundKey : null
  const imageObjectKey = typeof input.imageObjectKey === 'string' && input.imageObjectKey ? input.imageObjectKey : null

  const draft = await prisma.postDraft.create({
    data: { authorId: userId, sourceText, backgroundKey, imageObjectKey },
  })

  return json({ draft }, { status: 201 })
}

/** PATCH — update an existing draft (draftId in body) */
export async function PATCH(request: NextRequest) {
  const userId = getViewerId(await getServerSession(getAuthOptions()))
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_body' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const input = body as Record<string, unknown>
  const draftId = typeof input.draftId === 'string' ? input.draftId.trim() : ''
  if (!draftId) return json({ error: 'draft_id_required' }, { status: 400 })

  const existing = await prisma.postDraft.findFirst({
    where: { id: draftId, authorId: userId },
  })
  if (!existing) return json({ error: 'not_found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if ('sourceText' in input) data.sourceText = typeof input.sourceText === 'string' ? input.sourceText : null
  if ('backgroundKey' in input) data.backgroundKey = typeof input.backgroundKey === 'string' ? input.backgroundKey : null
  if ('imageObjectKey' in input) data.imageObjectKey = typeof input.imageObjectKey === 'string' && input.imageObjectKey ? input.imageObjectKey : null

  if (Object.keys(data).length === 0) return json({ error: 'no_changes' }, { status: 400 })

  const updated = await prisma.postDraft.update({ where: { id: draftId }, data })

  return json({ draft: updated })
}

/** DELETE — remove a specific draft (draftId query param or body) */
export async function DELETE(request: NextRequest) {
  const userId = getViewerId(await getServerSession(getAuthOptions()))
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const draftId = request.nextUrl.searchParams.get('draftId')?.trim()
    || (await request.json().then((b) => (b as Record<string, unknown>).draftId).catch(() => ''))
  if (typeof draftId !== 'string' || !draftId) return json({ error: 'draft_id_required' }, { status: 400 })

  const existing = await prisma.postDraft.findFirst({
    where: { id: draftId, authorId: userId },
  })
  if (!existing) return json({ error: 'not_found' }, { status: 404 })

  await prisma.postDraft.delete({ where: { id: draftId } })

  return json({ deleted: true })
}
