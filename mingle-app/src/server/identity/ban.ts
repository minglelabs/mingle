import { prisma } from '@/lib/prisma'
import { identityKeyHash, identityMethodForProvider, STRONG_DEVICE_KEY_KINDS, type IdentityKeyKind } from '@/server/identity/keys'

// Permanent ban (docs/one-account-per-person.md, section 7). Banning one
// account bans its whole bundle: every account reached by a shared device,
// number or sign-in method. The numbers, sign-in methods and devices are then
// closed, so no new account can be made through them.
//
// Sessions are long-lived JWTs and cannot be taken back one by one: a banned
// account is stopped the next time the app asks /account/access, and at every
// later sign-in.

const MAX_BUNDLE_USERS = 200

export type BanBundleKey = { kind: IdentityKeyKind; keyHash: string }

export type BanBundle = {
  userIds: string[]
  deviceIds: string[]
  keys: BanBundleKey[]
  /** True when the walk stopped at MAX_BUNDLE_USERS: look before banning. */
  truncated: boolean
}

function isInternalEmail(email: string): boolean {
  return email.endsWith('@mingle.internal')
}

/** Everything one account holds: its numbers, sign-in methods, e-mail and every key it was ever seen with. */
async function readUserKeys(userId: string): Promise<{ keys: BanBundleKey[]; mergedIntoUserId: string | null }> {
  const [user, accounts, extraPhones, links] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, phoneE164: true, mergedIntoUserId: true } }),
    prisma.account.findMany({ where: { userId }, select: { provider: true, providerAccountId: true } }),
    prisma.appUserPhone.findMany({ where: { userId }, select: { phoneKeyHash: true } }),
    prisma.appIdentityLink.findMany({ where: { userId }, select: { method: true, methodKeyHash: true }, distinct: ['method', 'methodKeyHash'] }),
  ])
  const keys: BanBundleKey[] = []
  if (user?.phoneE164) keys.push({ kind: 'phone', keyHash: identityKeyHash('phone', user.phoneE164) })
  if (user?.email && !isInternalEmail(user.email)) keys.push({ kind: 'email', keyHash: identityKeyHash('email', user.email) })
  for (const account of accounts) {
    const method = identityMethodForProvider(account.provider)
    if (method) keys.push({ kind: method, keyHash: identityKeyHash(method, account.providerAccountId) })
  }
  for (const phone of extraPhones) keys.push({ kind: 'phone', keyHash: phone.phoneKeyHash })
  for (const link of links) keys.push({ kind: link.method as IdentityKeyKind, keyHash: link.methodKeyHash })
  return { keys, mergedIntoUserId: user?.mergedIntoUserId ?? null }
}

/**
 * Walks from one account to every account in its bundle. Staff test devices
 * (exempt) and weak device values (web storage, push installation id) join
 * nobody. Staff and official accounts are never pulled in by a shared device.
 */
export async function collectBanBundle(startUserId: string): Promise<BanBundle> {
  const userIds = new Set<string>([startUserId])
  const deviceIds = new Set<string>()
  const keys = new Map<string, BanBundleKey>()
  const queue = [startUserId]
  let truncated = false

  const visit = (userId: string) => {
    if (userIds.has(userId)) return
    if (userIds.size >= MAX_BUNDLE_USERS) {
      truncated = true
      return
    }
    userIds.add(userId)
    queue.push(userId)
  }

  while (queue.length > 0) {
    const userId = queue.shift() as string
    const own = await readUserKeys(userId)
    if (own.mergedIntoUserId) visit(own.mergedIntoUserId)
    const newKeys = own.keys.filter((key) => !keys.has(`${key.kind}:${key.keyHash}`))
    for (const key of newKeys) keys.set(`${key.kind}:${key.keyHash}`, key)

    const [foldedIn, sameKey, phoneOwners, deviceRows] = await Promise.all([
      prisma.user.findMany({ where: { mergedIntoUserId: userId }, select: { id: true } }),
      newKeys.length > 0
        ? prisma.appIdentityLink.findMany({
          where: { OR: newKeys.map((key) => ({ method: key.kind, methodKeyHash: key.keyHash })) },
          select: { userId: true },
          distinct: ['userId'],
        })
        : Promise.resolve([]),
      newKeys.some((key) => key.kind === 'phone')
        ? prisma.appUserPhone.findMany({
          where: { phoneKeyHash: { in: newKeys.filter((key) => key.kind === 'phone').map((key) => key.keyHash) } },
          select: { userId: true },
        })
        : Promise.resolve([]),
      prisma.appDeviceUser.findMany({
        where: { userId, device: { exemptAt: null, keyKind: { in: [...STRONG_DEVICE_KEY_KINDS] } } },
        select: { deviceId: true },
      }),
    ])
    for (const row of foldedIn) visit(row.id)
    for (const row of sameKey) visit(row.userId)
    for (const row of phoneOwners) visit(row.userId)

    const newDeviceIds = deviceRows.map((row) => row.deviceId).filter((id) => !deviceIds.has(id))
    for (const id of newDeviceIds) deviceIds.add(id)
    if (newDeviceIds.length > 0) {
      const sameDevice = await prisma.appDeviceUser.findMany({ where: { deviceId: { in: newDeviceIds } }, select: { userId: true } })
      const candidates = [...new Set(sameDevice.map((row) => row.userId))].filter((id) => !userIds.has(id))
      if (candidates.length > 0) {
        const ordinary = await prisma.user.findMany({
          where: { id: { in: candidates }, isOperator: false, isOfficial: false },
          select: { id: true },
        })
        for (const row of ordinary) visit(row.id)
      }
    }
  }

  return { userIds: [...userIds], deviceIds: [...deviceIds], keys: [...keys.values()], truncated }
}

export type BanPreviewUser = {
  id: string
  name: string | null
  handle: string | null
  createdAt: Date
  bannedAt: Date | null
  isDeleted: boolean
}

/** What a ban of this account would take with it. The admin tool shows this before anything is banned. */
export async function previewBan(userId: string): Promise<{ bundle: BanBundle; users: BanPreviewUser[] }> {
  const bundle = await collectBanBundle(userId)
  const users = await prisma.user.findMany({
    where: { id: { in: bundle.userIds } },
    select: { id: true, name: true, handle: true, createdAt: true, bannedAt: true, isDeleted: true },
    orderBy: { createdAt: 'asc' },
  })
  return { bundle, users }
}

export type BanResult = { bannedUserIds: string[]; blockedKeys: number; blockedDevices: number }

/**
 * Bans the account and its bundle. `onlyUserIds` narrows it to the accounts
 * the operator ticked in the preview (the start account is always included);
 * only what those accounts hold is closed then.
 */
export async function banUserBundle(input: {
  userId: string
  reason?: string | null
  operatorUserId?: string | null
  onlyUserIds?: string[]
}): Promise<BanResult> {
  const reason = input.reason?.trim().slice(0, 500) || null
  let bundle = await collectBanBundle(input.userId)
  if (input.onlyUserIds) {
    const chosen = new Set([input.userId, ...input.onlyUserIds.filter((id) => bundle.userIds.includes(id))])
    const keys = new Map<string, BanBundleKey>()
    for (const userId of chosen) {
      for (const key of (await readUserKeys(userId)).keys) keys.set(`${key.kind}:${key.keyHash}`, key)
    }
    const devices = await prisma.appDeviceUser.findMany({
      where: { userId: { in: [...chosen] }, device: { exemptAt: null, keyKind: { in: [...STRONG_DEVICE_KEY_KINDS] } } },
      select: { deviceId: true },
    })
    bundle = { userIds: [...chosen], deviceIds: [...new Set(devices.map((row) => row.deviceId))], keys: [...keys.values()], truncated: false }
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.user.updateMany({ where: { id: { in: bundle.userIds }, bannedAt: null }, data: { bannedAt: now, bannedReason: reason } }),
    prisma.userPushToken.deleteMany({ where: { userId: { in: bundle.userIds } } }),
    prisma.appIdentityBlock.createMany({
      data: bundle.keys.map((key) => ({ kind: key.kind, keyHash: key.keyHash, sourceUserId: input.userId, reason })),
      skipDuplicates: true,
    }),
    prisma.appDevice.updateMany({ where: { id: { in: bundle.deviceIds }, blockedAt: null }, data: { blockedAt: now, blockedReason: reason } }),
    prisma.adminAuditLog.create({
      data: {
        action: 'identity.ban',
        operatorUserId: input.operatorUserId ?? null,
        targetType: 'user',
        targetId: input.userId,
        metadata: { userIds: bundle.userIds, deviceIds: bundle.deviceIds, keyCount: bundle.keys.length, reason },
      },
    }),
  ])
  return { bannedUserIds: bundle.userIds, blockedKeys: bundle.keys.length, blockedDevices: bundle.deviceIds.length }
}

/** Lifts the ban on one account and reopens what only it holds. Other accounts of the bundle stay banned. */
export async function unbanUser(input: { userId: string; operatorUserId?: string | null }): Promise<void> {
  const own = await readUserKeys(input.userId)
  const devices = await prisma.appDeviceUser.findMany({ where: { userId: input.userId }, select: { deviceId: true } })
  const deviceIds = devices.map((row) => row.deviceId)
  // A device or key shared with an account that stays banned stays closed.
  const stillBannedOnDevice = deviceIds.length > 0
    ? await prisma.appDeviceUser.findMany({ where: { deviceId: { in: deviceIds }, userId: { not: input.userId } }, select: { deviceId: true, userId: true } })
    : []
  const bannedUsers = stillBannedOnDevice.length > 0
    ? new Set((await prisma.user.findMany({ where: { id: { in: stillBannedOnDevice.map((row) => row.userId) }, bannedAt: { not: null } }, select: { id: true } })).map((row) => row.id))
    : new Set<string>()
  const keepClosed = new Set(stillBannedOnDevice.filter((row) => bannedUsers.has(row.userId)).map((row) => row.deviceId))
  const reopenDeviceIds = deviceIds.filter((id) => !keepClosed.has(id))

  await prisma.$transaction([
    prisma.user.update({ where: { id: input.userId }, data: { bannedAt: null, bannedReason: null } }),
    ...(own.keys.length > 0
      ? [prisma.appIdentityBlock.deleteMany({ where: { OR: own.keys.map((key) => ({ kind: key.kind, keyHash: key.keyHash })) } })]
      : []),
    prisma.appDevice.updateMany({ where: { id: { in: reopenDeviceIds } }, data: { blockedAt: null, blockedReason: null } }),
    prisma.adminAuditLog.create({
      data: { action: 'identity.unban', operatorUserId: input.operatorUserId ?? null, targetType: 'user', targetId: input.userId },
    }),
  ])
}
