import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { accountRestrictionGuard } from '@/server/reports/account-restriction'
import { parseImageKeyInput } from '@/server/posts/post-image-keys'
import { imageDimensionColumns, parseImageDimensions } from '@/server/posts/post-image-dimensions'

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

type DraftCursor = { updatedAt: string; id: string }

function encodeDraftCursor(cursor: DraftCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeDraftCursor(raw: string | null): DraftCursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'))
    if (typeof parsed?.updatedAt !== 'string' || typeof parsed?.id !== 'string') return null
    if (Number.isNaN(Date.parse(parsed.updatedAt))) return null
    return { updatedAt: parsed.updatedAt, id: parsed.id }
  } catch {
    return null
  }
}

/**
 * GET — list drafts, newest-updated first, `limit` per page. `nextCursor`
 * (opaque) fetches the next page with `?cursor=`; null on the last page.
 */
export async function GET(request: NextRequest) {
  const userId = getViewerId(await getServerSession(getAuthOptions()))
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const rawLimit = Number(request.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(MAX_LIMIT, Math.floor(rawLimit)) : DEFAULT_LIMIT
  const cursor = decodeDraftCursor(request.nextUrl.searchParams.get('cursor'))
  const at = cursor ? new Date(cursor.updatedAt) : null

  const rows = await prisma.postDraft.findMany({
    where: {
      authorId: userId,
      ...(at && cursor
        ? { OR: [{ updatedAt: { lt: at } }, { updatedAt: at, id: { lt: cursor.id } }] }
        : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  const drafts = hasMore ? rows.slice(0, limit) : rows
  const last = drafts[drafts.length - 1]
  const nextCursor = hasMore && last
    ? encodeDraftCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id })
    : null

  return json({ drafts, nextCursor })
}

/** POST — create a new draft */
export async function POST(request: NextRequest) {
  const userId = getViewerId(await getServerSession(getAuthOptions()))
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })
  const restricted = await accountRestrictionGuard(userId)
  if (restricted) return restricted

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_body' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const input = body as Record<string, unknown>
  const sourceText = typeof input.sourceText === 'string' ? input.sourceText : null
  const backgroundKey = typeof input.backgroundKey === 'string' ? input.backgroundKey : null
  // Draft images come from POST /posts/images; only this user's issued keys.
  const imageInput = parseImageKeyInput(input, userId)
  if (imageInput.kind === 'invalid') return json({ error: 'invalid_image_key' }, { status: 400 })
  const imageObjectKey = imageInput.kind === 'set' ? imageInput.key : null
  const dimensions = imageObjectKey ? imageDimensionColumns(parseImageDimensions(input)) : {}

  const draft = await prisma.postDraft.create({
    data: { authorId: userId, sourceText, backgroundKey, imageObjectKey, ...dimensions },
  })

  return json({ draft }, { status: 201 })
}

/** PATCH — update an existing draft (draftId in body) */
export async function PATCH(request: NextRequest) {
  const userId = getViewerId(await getServerSession(getAuthOptions()))
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })
  const restricted = await accountRestrictionGuard(userId)
  if (restricted) return restricted

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
  const imageInput = parseImageKeyInput(input, userId)
  if (imageInput.kind === 'invalid') return json({ error: 'invalid_image_key' }, { status: 400 })
  if (imageInput.kind === 'set') {
    data.imageObjectKey = imageInput.key
    // Keep the stored size when the same key is re-sent without one.
    const dimensions = parseImageDimensions(input)
    if (dimensions || imageInput.key !== existing.imageObjectKey) {
      Object.assign(data, imageDimensionColumns(dimensions))
    }
  }
  if (imageInput.kind === 'clear') {
    data.imageObjectKey = null
    Object.assign(data, imageDimensionColumns(null))
  }

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
