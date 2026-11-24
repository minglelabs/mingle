import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { classifyReferencePhoto, referenceAutoTagEnabled } from '@/server/reference-library/classify'
import { listReferencePhotos, loadReferenceBytes, setReferenceAnalysis } from '@/server/reference-library/library'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST: the AI looks at the photo again and replaces its description and
 * attributes; kind and gender stay as staff set them (the AI's own reading of
 * those comes back as `suggested`).
 */
export async function POST(_request: Request, context: Ctx) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  // The AI look ends with 2026-12-12 like the automatic tags on upload.
  if (!referenceAutoTagEnabled()) return json({ error: 'auto_tag_ended' }, 410)
  const { id } = await context.params
  const photo = (await listReferencePhotos()).find((item) => item.id === id)
  if (!photo) return json({ error: 'not_found' }, 404)
  const look = await classifyReferencePhoto((await loadReferenceBytes(photo)).bytes, { timeoutMs: 90_000 })
  if (!look) return json({ error: 'analyze_failed' }, 502)
  await setReferenceAnalysis(id, { summary: look.summary, attributes: look.attributes })
  return json({ ok: true, summary: look.summary, attributes: look.attributes, suggested: { kind: look.kind, gender: look.gender } })
}
