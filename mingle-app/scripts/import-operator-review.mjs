#!/usr/bin/env node
/**
 * Copies operator accounts and their pre-written posts from a staff machine's
 * local database into the target database (DATABASE_URL) as items waiting for
 * staff review (/admin/operators/review):
 *
 *   - each account is inserted inactive, with review_state 'pending', so it is
 *     hidden from users and from every automation until staff publish it;
 *   - each reserve post is inserted in the `review` state. A post that was
 *     already published locally keeps its drawn photo (image_object_key; both
 *     machines share the private image bucket) and loses its local post id.
 *
 * Rows that already exist in the target (same id) are skipped, so a rerun only
 * adds what is missing. An account whose handle is taken in the target is
 * skipped with its posts.
 *
 *   SOURCE_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mingle?schema=app \
 *     railway run -- node scripts/import-operator-review.mjs [--dry-run]
 */
import { PrismaClient } from '@prisma/client'

const BATCH = 500
const dryRun = process.argv.includes('--dry-run')

function client(url) {
  return new PrismaClient({ datasources: { db: { url } } })
}

async function tableColumns(db, table) {
  const rows = await db.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'app' AND table_name = $1`,
    table,
  )
  return new Set(rows.map((row) => row.column_name))
}

/** Inserts JSON rows through jsonb_populate_recordset, naming only columns both sides have. */
async function insertRows(db, table, rows, targetColumns) {
  if (rows.length === 0) return 0
  const columns = Object.keys(rows[0]).filter((column) => targetColumns.has(column))
  const list = columns.map((column) => `"${column}"`).join(', ')
  let inserted = 0
  for (let start = 0; start < rows.length; start += BATCH) {
    const chunk = rows.slice(start, start + BATCH)
    inserted += await db.$executeRawUnsafe(
      `INSERT INTO app.${table} (${list})
       SELECT ${list} FROM jsonb_populate_recordset(NULL::app.${table}, $1::jsonb)
       ON CONFLICT DO NOTHING`,
      JSON.stringify(chunk),
    )
  }
  return inserted
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL
  const targetUrl = process.env.DATABASE_URL
  if (!sourceUrl || !targetUrl) throw new Error('SOURCE_DATABASE_URL and DATABASE_URL are required')
  if (sourceUrl === targetUrl) throw new Error('source and target are the same database')
  const source = client(sourceUrl)
  const target = client(targetUrl)
  try {
    const users = await source.$queryRawUnsafe(`
      SELECT to_jsonb(u) AS row FROM app.app_users u
      JOIN app.app_operator_accounts o ON o.user_id = u.id
      WHERE u.is_operator = true AND u.is_deleted = false
      ORDER BY o.created_at, u.id`)
    const takenHandles = new Set((await target.$queryRawUnsafe(
      `SELECT handle FROM app.app_users WHERE handle = ANY($1::text[]) AND id <> ALL($2::text[])`,
      users.map(({ row }) => row.handle),
      users.map(({ row }) => row.id),
    )).map((row) => row.handle))
    const kept = users.map(({ row }) => row).filter((row) => !takenHandles.has(row.handle))
    const ids = kept.map((row) => row.id)

    const accounts = (await source.$queryRawUnsafe(
      `SELECT to_jsonb(o) AS row FROM app.app_operator_accounts o WHERE o.user_id = ANY($1::text[])`, ids,
    )).map(({ row }) => ({ ...row, review_state: 'pending', review_feedback: null }))

    const reserve = (await source.$queryRawUnsafe(`
      SELECT to_jsonb(r) AS row, p.image_object_key, p.image_width, p.image_height
      FROM app.app_operator_post_reserve r
      LEFT JOIN app.app_posts p ON p.id = r.post_id
      WHERE r.operator_user_id = ANY($1::text[]) AND r.state IN ('queued', 'published')
      ORDER BY r.created_at, r.id`, ids,
    )).map(({ row, image_object_key, image_width, image_height }) => ({
      ...row,
      state: 'review',
      release_at: null,
      post_id: null,
      error: null,
      attempts: 0,
      review_feedback: null,
      image_object_key: image_object_key ?? null,
      image_width: image_width ?? null,
      image_height: image_height ?? null,
    }))

    console.log(JSON.stringify({
      accounts: kept.length,
      skippedHandles: [...takenHandles],
      posts: reserve.length,
      postsWithPhoto: reserve.filter((row) => row.image_object_key).length,
      dryRun,
    }))
    if (dryRun) return

    const userRows = kept.map((row) => ({ ...row, is_active: false }))
    const insertedUsers = await insertRows(target, 'app_users', userRows, await tableColumns(target, 'app_users'))
    const insertedAccounts = await insertRows(target, 'app_operator_accounts', accounts, await tableColumns(target, 'app_operator_accounts'))
    const insertedPosts = await insertRows(target, 'app_operator_post_reserve', reserve, await tableColumns(target, 'app_operator_post_reserve'))
    console.log(JSON.stringify({ insertedUsers, insertedAccounts, insertedPosts }))
  } finally {
    await source.$disconnect()
    await target.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
