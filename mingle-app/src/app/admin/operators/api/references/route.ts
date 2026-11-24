import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { addReferencePhoto, REFERENCE_MAX_BYTES, REFERENCE_TYPES, type ReferenceGender } from '@/server/reference-library/library'
import { listReferencePhotoViews } from '@/server/reference-library/view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** GET: the reference library, newest first. */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  return json({ items: await listReferencePhotoViews() })
}

/** POST (form): `file` (one or more) and `gender` (female | male | empty) adds photos to the library. */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const form = await request.formData().catch(() => null)
  if (!form) return json({ error: 'invalid_body' }, 400)
  const rawGender = form.get('gender')
  const gender: ReferenceGender | null = rawGender === 'female' || rawGender === 'male' ? rawGender : null
  const files = form.getAll('file').filter((value): value is File => value instanceof File && value.size > 0)
  if (files.length === 0) return json({ error: 'file_required' }, 400)
  let added = 0
  let rejected = 0
  for (const file of files.slice(0, 50)) {
    if (!(REFERENCE_TYPES as readonly string[]).includes(file.type) || file.size > REFERENCE_MAX_BYTES) { rejected += 1; continue }
    try {
      await addReferencePhoto(Buffer.from(await file.arrayBuffer()), gender)
      added += 1
    } catch (error) {
      console.warn('[reference-library] add_failed', { error: error instanceof Error ? error.name : 'unknown' })
      rejected += 1
    }
  }
  if (added) await writeAdminAudit(auth.ctx, { action: 'reference.add', targetType: 'reference_library', metadata: { added, gender } })
  return json({ added, rejected, items: await listReferencePhotoViews() }, added ? 201 : 400)
}
