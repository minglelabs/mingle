import { type NextRequest } from 'next/server'
import { kickOperatorPostWorker } from '@/instrumentation'
import { requireAdminApi } from '@/server/admin/guard'
import { createOperatorPostBatch, listRecentOperatorPostBatches } from '@/server/operator-posts/jobs'
import type { OperatorPostBatchCreateResponse } from '@/server/operator-posts/types'
import { adminJson, readJsonObject } from '../http'

export const runtime = 'nodejs'

/**
 * POST `{ items: OperatorPostBatchItemInput[] }` — queue up to 100 operator
 * posts. Answers 202 at once with each item `queued` (+ publish time) or
 * `invalid` (+ reason); publishing happens in the background worker, so the
 * request never waits on translation (the launcher drops requests idle for
 * 120 s). Items due right away ("바로 게시") kick the worker.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await readJsonObject(request)
  if (!body) return adminJson({ error: 'invalid_body' }, 400)

  const result = await createOperatorPostBatch(auth.ctx, body.items)
  if (!result.ok) {
    switch (result.error) {
      case 'no_items':
        return adminJson({ error: result.error }, 400)
      case 'too_many_items':
        return adminJson({ error: result.error, limit: result.limit }, 400)
      case 'queue_full':
        return adminJson({ error: result.error, limit: result.limit, waiting: result.waiting }, 409)
    }
  }

  if (result.hasDueItems) kickOperatorPostWorker()

  const response: OperatorPostBatchCreateResponse = {
    batchId: result.batchId,
    queued: result.queued,
    invalid: result.invalid,
    items: result.items,
  }
  return adminJson(response, 202)
}

/** GET `?limit=` — the newest batches with per-state counts. */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const limit = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '', 10)
  const batches = await listRecentOperatorPostBatches({ limit: Number.isFinite(limit) ? limit : undefined })
  return adminJson({ batches })
}
