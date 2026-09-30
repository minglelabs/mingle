import { after, NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { whenOperatorBioQueueIdle } from '@/server/operators/bio-queue'
import { createOperatorAccount } from '@/server/operators/create-operator'
import type { CreateOperatorItemResult } from '@/server/operators/operator-api-types'
import { OperatorHandleUnavailableError } from '@/server/operators/operator-handles'
import {
  PERSONA_MAX_DRAFTS,
  validateOperatorNotes,
  validatePersonaDraft,
} from '@/server/operators/persona-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * POST /admin/operators/api/create — creates one operator account per edited
 * draft. Body: `{ drafts: Array<PersonaDraft & { notes? }> }` (1-20). Every
 * draft is validated again here; the answer lists one result per draft in
 * order, so a bad draft never blocks the others. Bios are written and
 * translated in the background (bio-queue.ts), so this returns in a few
 * hundred milliseconds even for 20 accounts.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!isRecord(body) || !Array.isArray(body.drafts) || body.drafts.length < 1 || body.drafts.length > PERSONA_MAX_DRAFTS) {
    return json({ error: 'invalid_drafts' }, 400)
  }

  const results: CreateOperatorItemResult[] = []
  for (const [index, item] of body.drafts.entries()) {
    const checked = validatePersonaDraft(item)
    const notes = validateOperatorNotes(isRecord(item) ? item.notes : undefined)
    if (!checked.ok || !notes.ok) {
      results.push({
        index,
        ok: false,
        error: 'invalid_draft',
        errors: [...(checked.ok ? [] : checked.errors), ...(notes.ok ? [] : [{ field: 'notes' as const, error: notes.error }])],
      })
      continue
    }
    try {
      const created = await createOperatorAccount(auth.ctx, checked.draft, { notes: notes.value })
      results.push({ index, ok: true, ...created })
    } catch (error) {
      if (error instanceof OperatorHandleUnavailableError) {
        results.push({ index, ok: false, error: 'handle_unavailable', errors: [{ field: 'handle', error: 'handle_taken' }] })
      } else {
        console.error('[admin/operators/create] create_failed', { error: error instanceof Error ? error.name : 'unknown' })
        results.push({ index, ok: false, error: 'create_failed' })
      }
    }
  }

  // Keep the request's lifetime covering the queued bio writes / translations.
  if (results.some(result => result.ok && result.bioQueued)) after(() => whenOperatorBioQueueIdle())
  return json({ results })
}
