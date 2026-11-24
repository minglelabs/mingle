import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { classifyReferencePhoto, referenceAutoTagEnabled } from '@/server/reference-library/classify'
import { addReferencePhoto, isReferenceKind, REFERENCE_MAX_BYTES, REFERENCE_TYPES, referenceKindHasGender, type ReferenceGender, type ReferenceKind } from '@/server/reference-library/library'
import { listReferencePhotoViews } from '@/server/reference-library/view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** GET: the reference library, newest first. */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  return json({ items: await listReferencePhotoViews() })
}

/**
 * POST (form): `file` (one or more) adds photos to the library. `kind` (thing |
 * face | person | group) and `gender` (female | male | none) set them for the whole
 * batch; left out (or `auto`), Claude looks at each photo and tags it, through
 * 2026-12-12 only. After that `kind` is required and an unset gender is none.
 * `note` is staff's one-line note for every photo of the batch.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const form = await request.formData().catch(() => null)
  if (!form) return json({ error: 'invalid_body' }, 400)
  const rawGender = form.get('gender')
  const fixedGender: ReferenceGender | null | undefined = rawGender === 'female' || rawGender === 'male' ? rawGender : rawGender === 'none' ? null : undefined
  const rawKind = form.get('kind')
  const fixedKind: ReferenceKind | undefined = isReferenceKind(rawKind) ? rawKind : undefined
  const note = typeof form.get('note') === 'string' ? form.get('note') as string : null
  const autoTag = referenceAutoTagEnabled()
  if (!autoTag && !fixedKind) return json({ error: 'kind_required' }, 400)
  const files = form.getAll('file').filter((value): value is File => value instanceof File && value.size > 0)
  if (files.length === 0) return json({ error: 'file_required' }, 400)
  let added = 0
  let rejected = 0
  for (const file of files.slice(0, 50)) {
    if (!(REFERENCE_TYPES as readonly string[]).includes(file.type) || file.size > REFERENCE_MAX_BYTES) { rejected += 1; continue }
    try {
      const bytes = Buffer.from(await file.arrayBuffer())
      const look = autoTag && (fixedKind === undefined || fixedGender === undefined) ? await classifyReferencePhoto(bytes) : null
      const kind = fixedKind ?? look?.kind ?? null
      await addReferencePhoto(bytes, {
        kind,
        gender: !referenceKindHasGender(kind) ? null : fixedGender !== undefined ? fixedGender : look?.gender ?? null,
        summary: look?.summary ?? null,
        note,
      })
      added += 1
    } catch (error) {
      console.warn('[reference-library] add_failed', { error: error instanceof Error ? error.name : 'unknown' })
      rejected += 1
    }
  }
  if (added) await writeAdminAudit(auth.ctx, { action: 'reference.add', targetType: 'reference_library', metadata: { added, kind: fixedKind ?? 'auto', gender: fixedGender === undefined ? 'auto' : fixedGender } })
  return json({ added, rejected, items: await listReferencePhotoViews() }, added ? 201 : 400)
}
