import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Hiding from people in the address book (owner, 2026-11-26), as dating apps
 * in Korea do. Syncing contacts keeps the sha256 hash of each contact's
 * number (`ContactAvoid`; never the number or the name). On the explore tab
 * the person who synced and each of those contacts do not see each other:
 * someone who came to meet new people is not shown to a colleague or an ex,
 * and does not find them there either.
 *
 * - On by default once contacts are synced. The switch on the contacts screen
 *   turns it off for the account (`User.contactHideOff`), which also deletes
 *   every hash kept for it.
 * - Per person: a friend already on HashChat can be let through
 *   (`allowed`), so the two show up for each other again.
 * - A contact who joins later is covered too: their number's hash is already
 *   there. That is why the hashes are kept (they were not, before this).
 * - Only the explore tab. A profile opened from a link, the feed, follows and
 *   chats are untouched; blocking someone is a different, stronger thing.
 */

export type ContactAvoidState = {
  /** Hiding is on for this account. */
  enabled: boolean
  /** Numbers kept for it. */
  count: number
}

export async function readContactAvoid(userId: string): Promise<ContactAvoidState> {
  const [user, count] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { contactHideOff: true } }),
    prisma.contactAvoid.count({ where: { ownerId: userId } }),
  ])
  return { enabled: user?.contactHideOff !== true, count }
}

/** The account-wide switch. Off forgets every hash; on again, the next sync brings them back. */
export async function setContactAvoidEnabled(userId: string, enabled: boolean): Promise<ContactAvoidState> {
  await prisma.user.update({ where: { id: userId }, data: { contactHideOff: !enabled } })
  if (!enabled) await prisma.contactAvoid.deleteMany({ where: { ownerId: userId } })
  return readContactAvoid(userId)
}

/** Keeps the hashes of a sync (unless hiding is off). Rows already there keep their `allowed`. */
export async function rememberContactHashes(userId: string, hashes: readonly string[]): Promise<void> {
  if (hashes.length === 0) return
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { contactHideOff: true } })
  if (user?.contactHideOff) return
  await prisma.contactAvoid.createMany({
    data: hashes.map((contactHash) => ({ ownerId: userId, contactHash })),
    skipDuplicates: true,
  })
}

/** Which of these numbers the account is hidden from now (kept, and not let through). */
export async function listHiddenContactHashes(userId: string, hashes: readonly string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set()
  const rows = await prisma.contactAvoid.findMany({
    where: { ownerId: userId, contactHash: { in: [...hashes] }, allowed: false },
    select: { contactHash: true },
  })
  return new Set(rows.map((row) => row.contactHash))
}

/**
 * Lets one friend through, or hides from them again. The friend is named by
 * account (the screen lists matched friends); only someone whose number is
 * among this account's kept contacts can be switched.
 */
export async function setContactHiddenFrom(userId: string, targetUserId: string, hidden: boolean): Promise<{ ok: true; hidden: boolean } | { ok: false; error: 'not_found' }> {
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { phoneHash: true } })
  if (!target?.phoneHash) return { ok: false, error: 'not_found' }
  const changed = await prisma.contactAvoid.updateMany({
    where: { ownerId: userId, contactHash: target.phoneHash },
    data: { allowed: !hidden },
  })
  if (changed.count === 0) return { ok: false, error: 'not_found' }
  return { ok: true, hidden }
}

/**
 * For the explore tab's query (`u` is the candidate): leaves out anyone who
 * keeps the viewer's number, and anyone whose number the viewer keeps.
 */
export function contactAvoidSql(viewerId: string): Prisma.Sql {
  return Prisma.sql`
        AND NOT EXISTS (
          SELECT 1 FROM app.app_contact_avoids ca
          WHERE ca.owner_id = u.id AND ca.allowed = false
            AND ca.contact_hash = (SELECT v.phone_hash FROM app.app_users v WHERE v.id = ${viewerId})
        )
        AND NOT EXISTS (
          SELECT 1 FROM app.app_contact_avoids ca
          WHERE ca.owner_id = ${viewerId} AND ca.allowed = false AND ca.contact_hash = u.phone_hash
        )`
}
