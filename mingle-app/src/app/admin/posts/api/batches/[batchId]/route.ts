import { requireAdminApi } from '@/server/admin/guard'
import { cancelOperatorPostJobs, getOperatorPostBatch, listQueuedJobIds } from '@/server/operator-posts/jobs'
import type { OperatorPostCancelResponse } from '@/server/operator-posts/types'
import { adminJson, readJsonObject } from '../../http'

export const runtime = 'nodejs'

type Context = { params: Promise<{ batchId: string }> }

/** GET — every item of the batch with its state, post id and last error (the phone polls this). */
export async function GET(_request: Request, context: Context) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { batchId } = await context.params
  const batch = await getOperatorPostBatch(batchId.trim())
  if (!batch) return adminJson({ error: 'not_found' }, 404)
  return adminJson(batch)
}

/**
 * POST `{ action: 'cancel', jobIds: string[] }` or `{ action: 'cancel', all: true }`
 * — cancel items of this batch that are still queued. Items already
 * publishing or done are left alone.
 */
export async function POST(request: Request, context: Context) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { batchId: rawBatchId } = await context.params
  const batchId = rawBatchId.trim()
  const body = await readJsonObject(request)
  if (!body || body.action !== 'cancel') return adminJson({ error: 'invalid_body' }, 400)

  let jobIds: unknown[]
  if (body.all === true) jobIds = await listQueuedJobIds(batchId)
  else if (Array.isArray(body.jobIds)) jobIds = body.jobIds
  else return adminJson({ error: 'invalid_body' }, 400)

  const { cancelled } = await cancelOperatorPostJobs(auth.ctx, jobIds, { batchId })
  const response: OperatorPostCancelResponse = {
    cancelled: cancelled.length,
    batch: await getOperatorPostBatch(batchId),
  }
  return adminJson(response)
}
