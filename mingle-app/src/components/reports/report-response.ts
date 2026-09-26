/**
 * A report API answers a repeat report of the same target with 200
 * `{ status: 'already_reported', duplicate: true }`. Every report UI (the
 * shared report sheet and the profile's report form) reads it through this
 * helper so a duplicate shows "already reported", never "received".
 */
export function isDuplicateReportBody(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false
  const record = body as { duplicate?: unknown; status?: unknown }
  return record.duplicate === true || record.status === 'already_reported'
}
