/**
 * Sends Hamzzi's welcome DM (and the mutual follow) to every existing
 * registered account, without push notifications. Idempotent: the welcome
 * has a fixed clientMessageId per room, so a re-run changes nothing for
 * accounts that already have it.
 *
 *   pnpm tsx scripts/backfill-hamzzi-welcome.ts            # dry run: counts only
 *   pnpm tsx scripts/backfill-hamzzi-welcome.ts --apply    # send
 *   pnpm tsx scripts/backfill-hamzzi-welcome.ts --apply --limit 10
 *   pnpm tsx scripts/backfill-hamzzi-welcome.ts --staff [--apply]
 *     targets the team instead: Royce and every active operator account
 *     (Hamzzi never auto-replies to operators, and they never auto-reply to Hamzzi)
 *
 * Production: run from mingle-app with `railway run pnpm tsx ...`.
 * "Registered" matches royce-welcome-diagnostic.sql: active, not deleted, and
 * with a password, an email, a non-anonymous external id or an OAuth account.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { HAMZZI_USER_ID } from '../src/lib/hamzzi'
import { ROYCE_USER_ID, ensureHamzziWelcome } from '../src/lib/signup-welcome-onboarding'

const CONCURRENCY = 4

type Target = { id: string; locale: string | null }

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const staff = args.includes('--staff')
  const limitIndex = args.indexOf('--limit')
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : null
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) throw new Error('--limit needs a positive integer')

  const targets = await prisma.$queryRaw<Target[]>`
    SELECT u.id, COALESCE(u.default_display_language, u.language) AS locale
    FROM app.app_users AS u
    WHERE u.id <> ${HAMZZI_USER_ID}
      AND u.is_active
      AND u.is_deleted IS NOT TRUE
      AND ${staff ? Prisma.sql`(u.id = ${ROYCE_USER_ID} OR u.is_operator)` : Prisma.sql`
        u.id <> ${ROYCE_USER_ID}
        AND u.is_operator = false
        AND u.is_official = false
        AND (
          u.password_hash IS NOT NULL
          OR u.email IS NOT NULL
          OR (u.external_user_id IS NOT NULL AND u.external_user_id !~* '^anon_')
          OR EXISTS (SELECT 1 FROM app.auth_accounts AS account WHERE account.user_id = u.id)
        )`}
      AND NOT EXISTS (
        SELECT 1 FROM app.app_messages AS message
        WHERE message.session_key = 'mingle-welcome-hamzzi-' || u.id
          AND message.client_message_id = 'mingle-welcome-hamzzi-v1'
      )
    ORDER BY u.created_at ASC
  `
  const batch = limit ? targets.slice(0, limit) : targets
  console.log(`${staff ? 'team' : 'registered'} accounts without Hamzzi's welcome: ${targets.length}${limit ? ` (this run: ${batch.length})` : ''}`)
  if (!apply) {
    console.log('dry run: pass --apply to send')
    return
  }

  let next = 0
  let sent = 0
  let failed = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < batch.length) {
      const target = batch[next]
      next += 1
      const ok = await ensureHamzziWelcome({ userId: target.id, locale: target.locale ?? undefined, push: false })
      if (ok) sent += 1
      else failed += 1
      if ((sent + failed) % 50 === 0) console.log(`progress: ${sent + failed}/${batch.length} (failed ${failed})`)
    }
  }))
  console.log(`done: sent ${sent}, failed ${failed}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
