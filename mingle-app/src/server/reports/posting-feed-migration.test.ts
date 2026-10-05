import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Production can hold several legacy reports for the same (reporter, user):
 * nothing prevented it before 20260925170000. The migration must give each of
 * them a distinct target_key BEFORE the (reporter_id, target_key) unique index
 * is created, or the deploy fails. Executed end to end against Postgres during
 * review; this guards the ordering and the keep-every-row contract.
 */
const sql = readFileSync(
  path.join(process.cwd(), 'prisma/migrations/20260925170000_add_posting_feed/migration.sql'),
  'utf8',
)

describe('20260925170000_add_posting_feed report key backfill', () => {
  it('dedupes legacy duplicate reports before creating the unique index', () => {
    const backfill = sql.indexOf('ROW_NUMBER() OVER')
    const uniqueIndex = sql.indexOf('CREATE UNIQUE INDEX "app_user_reports_reporter_target_key_uidx"')
    expect(backfill).toBeGreaterThan(-1)
    expect(uniqueIndex).toBeGreaterThan(backfill)
  })

  it('keeps every row: earliest gets the canonical key, later ones a unique suffix', () => {
    expect(sql).toMatch(/PARTITION BY "reporter_id", "reported_user_id"\s+ORDER BY "created_at" ASC, "id" ASC/)
    expect(sql).toContain(`WHEN ranked.rn = 1 THEN 'user:' || r."reported_user_id"`)
    expect(sql).toContain(`ELSE 'user:' || r."reported_user_id" || '#legacy-dup:' || r."id"`)
    expect(sql).not.toMatch(/DELETE FROM "app_user_reports"/)
  })
})
