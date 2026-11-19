import { prisma } from '@/lib/prisma'
import { identityKeyHash, identityMethodForProvider } from '@/server/identity/keys'
import { recordIdentityLink } from '@/server/identity/links'

// The ways into one account, for the owner's "sign-in methods" list and the
// admin account page (docs/one-account-per-person.md, "떼기"). A method or
// number that was attached later (another sign-in folded into this account)
// can be taken off again by the owner; the one the account was made with, and
// its own number, cannot.

export type SignInMethodItem =
  | { kind: 'account'; id: string; provider: 'apple' | 'google'; detachable: boolean }
  | { kind: 'email'; email: string; detachable: false }
  | { kind: 'phone'; own: true; last4: string; detachable: false }
  | { kind: 'phone'; own: false; id: string; last4: string; detachable: true }

export class DetachRefused extends Error {
  constructor(readonly code: 'not_found' | 'not_detachable' | 'last_method') {
    super(code)
  }
}

/** Key hashes that were attached to the account and not taken off since. */
async function readAttachedKeyHashes(userId: string): Promise<Set<string>> {
  const rows = await prisma.appIdentityLink.findMany({
    where: { userId, event: { in: ['attached', 'detached'] } },
    orderBy: { createdAt: 'asc' },
    select: { method: true, methodKeyHash: true, event: true },
  })
  const attached = new Set<string>()
  for (const row of rows) {
    const key = `${row.method}:${row.methodKeyHash}`
    if (row.event === 'attached') attached.add(key)
    else attached.delete(key)
  }
  return attached
}

export async function listSignInMethods(userId: string): Promise<SignInMethodItem[]> {
  const [user, accounts, extraPhones, attached] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, passwordHash: true, phoneE164: true } }),
    prisma.account.findMany({ where: { userId }, select: { id: true, provider: true, providerAccountId: true }, orderBy: { id: 'asc' } }),
    prisma.appUserPhone.findMany({ where: { userId }, select: { id: true, last4: true }, orderBy: { verifiedAt: 'asc' } }),
    readAttachedKeyHashes(userId),
  ])
  const items: SignInMethodItem[] = []
  for (const account of accounts) {
    const provider = identityMethodForProvider(account.provider)
    if (!provider) continue
    items.push({
      kind: 'account',
      id: account.id,
      provider,
      detachable: attached.has(`${provider}:${identityKeyHash(provider, account.providerAccountId)}`),
    })
  }
  if (user?.email && user.passwordHash) items.push({ kind: 'email', email: user.email, detachable: false })
  if (user?.phoneE164) items.push({ kind: 'phone', own: true, last4: user.phoneE164.slice(-4), detachable: false })
  for (const phone of extraPhones) items.push({ kind: 'phone', own: false, id: phone.id, last4: phone.last4, detachable: true })
  // The account must keep one way in: with a single method left nothing is detachable.
  if (items.length <= 1) return items.map((item) => ({ ...item, detachable: false }) as SignInMethodItem)
  return items
}

/**
 * Takes an attached sign-in method or extra number off the account. `byAdmin`
 * also lets staff take off a method the owner could not (never the last one).
 * After this the method no longer signs in to the account; the usual rules
 * decide where it lands next.
 */
export async function detachSignInMethod(
  userId: string,
  target: { kind: 'account' | 'phone'; id: string },
  options: { byAdmin?: boolean } = {},
): Promise<void> {
  const items = await listSignInMethods(userId)
  if (target.kind === 'phone') {
    const item = items.find((entry) => entry.kind === 'phone' && !entry.own && entry.id === target.id)
    if (!item) throw new DetachRefused('not_found')
    const row = await prisma.appUserPhone.findFirst({ where: { id: target.id, userId }, select: { phoneKeyHash: true } })
    if (!row) throw new DetachRefused('not_found')
    await prisma.appUserPhone.delete({ where: { id: target.id } })
    await prisma.appIdentityLink.create({
      data: { userId, method: 'phone', methodKeyHash: row.phoneKeyHash, event: 'detached' },
    }).catch(() => null)
    return
  }
  const item = items.find((entry) => entry.kind === 'account' && entry.id === target.id)
  if (!item || item.kind !== 'account') throw new DetachRefused('not_found')
  if (items.length <= 1) throw new DetachRefused('last_method')
  if (!item.detachable && !options.byAdmin) throw new DetachRefused('not_detachable')
  const account = await prisma.account.findFirst({ where: { id: target.id, userId }, select: { providerAccountId: true } })
  if (!account) throw new DetachRefused('not_found')
  await prisma.account.delete({ where: { id: target.id } })
  await recordIdentityLink({ userId, method: item.provider, rawKey: account.providerAccountId, event: 'detached' })
}
