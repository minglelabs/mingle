import { prisma } from '@/lib/prisma'
import {
  identityKeyHash,
  identityMethodForProvider,
  isDeviceLinkOn,
  isStrongDeviceKeyKind,
  type DeviceKeyKind,
  type IdentityKeyKind,
  type IdentityMethod,
} from '@/server/identity/keys'

// Who was seen with which sign-in method, number and device
// (docs/one-account-per-person.md). The log is append-only and is what the
// admin history and the ban bundle are read from.

export type IdentityLinkEvent = 'sign_up' | 'sign_in' | 'phone_verified' | 'phone_in_use' | 'attached' | 'detached' | 'merged'

export type RequestIdentityContext = {
  device?: { id: string; strong: boolean; exempt: boolean; blocked: boolean } | null
  ip?: string | null
  appVersion?: string | null
}

type HeaderReader = { get(name: string): string | null }

export type DeviceHeader = { rawKey: string; keyKind: DeviceKeyKind; platform: string }

const DEVICE_KEY_KINDS: readonly string[] = ['keychain', 'android_id', 'web_local', 'push_installation']

/** The device value the app shell sends (x-mingle-device-id / x-mingle-device-kind). Web and older apps send none. */
export function readDeviceHeader(headers: HeaderReader): DeviceHeader | null {
  const rawKey = (headers.get('x-mingle-device-id') ?? '').trim()
  if (rawKey.length < 8 || rawKey.length > 128) return null
  const kind = (headers.get('x-mingle-device-kind') ?? '').trim().toLowerCase()
  if (!DEVICE_KEY_KINDS.includes(kind)) return null
  const platform = (headers.get('x-mingle-client-platform') ?? '').trim().toLowerCase()
  return { rawKey, keyKind: kind as DeviceKeyKind, platform: platform === 'ios' || platform === 'android' ? platform : 'web' }
}

export function readRequestIp(headers: HeaderReader): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (forwarded || headers.get('x-real-ip') || '').slice(0, 64) || null
}

/** Notes that this account is on this device, and returns the device. Never throws: a failed note must not block the request. */
export async function touchDevice(userId: string, header: DeviceHeader | null): Promise<RequestIdentityContext['device']> {
  if (!header) return null
  try {
    const now = new Date()
    const deviceKeyHash = identityKeyHash('device', header.rawKey)
    const device = await prisma.appDevice.upsert({
      where: { deviceKeyHash },
      create: { deviceKeyHash, keyKind: header.keyKind, platform: header.platform, firstSeenAt: now, lastSeenAt: now },
      update: { lastSeenAt: now },
      select: { id: true, keyKind: true, exemptAt: true, blockedAt: true },
    })
    await prisma.appDeviceUser.upsert({
      where: { deviceId_userId: { deviceId: device.id, userId } },
      create: { deviceId: device.id, userId, firstSeenAt: now, lastSeenAt: now },
      update: { lastSeenAt: now },
    })
    return {
      id: device.id,
      strong: isStrongDeviceKeyKind(device.keyKind) && isDeviceLinkOn(),
      exempt: Boolean(device.exemptAt),
      blocked: Boolean(device.blockedAt),
    }
  } catch (error) {
    console.error('[identity] device note failed', error)
    return null
  }
}

export async function buildRequestIdentityContext(userId: string, headers: HeaderReader): Promise<RequestIdentityContext> {
  return {
    device: await touchDevice(userId, readDeviceHeader(headers)),
    ip: readRequestIp(headers),
    appVersion: (headers.get('x-mingle-app-version') ?? '').trim().slice(0, 32) || null,
  }
}

/** One log row. Never throws. */
export async function recordIdentityLink(input: {
  userId: string
  method: IdentityMethod
  rawKey: string
  event: IdentityLinkEvent
  context?: RequestIdentityContext
}): Promise<void> {
  if (!input.rawKey.trim()) return
  try {
    await prisma.appIdentityLink.create({
      data: {
        userId: input.userId,
        method: input.method,
        methodKeyHash: identityKeyHash(input.method, input.rawKey),
        event: input.event,
        deviceId: input.context?.device?.id ?? null,
        ip: input.context?.ip ?? null,
        appVersion: input.context?.appVersion ?? null,
      },
    })
  } catch (error) {
    console.error('[identity] link note failed', error)
  }
}

/**
 * Notes a finished sign-in. `provider` is the NextAuth provider id: an OAuth
 * one names the method itself; the app's own bridge sign-in ("native-bridge")
 * notes every Apple/Google account the user has; e-mail sign-in notes the
 * address. Phone sign-in is noted where the code is checked.
 */
export async function recordSignIn(input: {
  userId: string
  provider: string | null | undefined
  providerAccountId?: string | null
  email?: string | null
  isNewUser?: boolean
}): Promise<void> {
  const event: IdentityLinkEvent = input.isNewUser ? 'sign_up' : 'sign_in'
  const method = identityMethodForProvider(input.provider)
  if (method && input.providerAccountId) {
    await recordIdentityLink({ userId: input.userId, method, rawKey: input.providerAccountId, event })
    return
  }
  if (input.provider === 'email-password' && input.email) {
    await recordIdentityLink({ userId: input.userId, method: 'email', rawKey: input.email, event })
    return
  }
  if (input.provider === 'native-bridge') {
    const accounts = await prisma.account.findMany({
      where: { userId: input.userId },
      select: { provider: true, providerAccountId: true },
    }).catch(() => [])
    for (const account of accounts) {
      const accountMethod = identityMethodForProvider(account.provider)
      if (accountMethod) await recordIdentityLink({ userId: input.userId, method: accountMethod, rawKey: account.providerAccountId, event })
    }
  }
}

/** Whether a permanent ban closed this number, sign-in method or e-mail. */
export async function isIdentityBlocked(kind: IdentityKeyKind, rawKey: string | null | undefined): Promise<boolean> {
  const value = (rawKey ?? '').trim()
  if (!value) return false
  const row = await prisma.appIdentityBlock.findUnique({
    where: { kind_keyHash: { kind, keyHash: identityKeyHash(kind, value) } },
    select: { id: true },
  })
  return row !== null
}

export type MergedTarget = { id: string; name: string | null; email: string | null; externalUserId: string | null }

/**
 * An empty account folded into another one stays as a pointer. This follows
 * the pointer to the live account, or returns null when the id was never
 * folded (or its target is gone or banned).
 */
export async function resolveMergedUser(userId: string): Promise<MergedTarget | null> {
  let currentId = userId
  for (let hop = 0; hop < 3; hop += 1) {
    const user = await prisma.user.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, email: true, externalUserId: true, isDeleted: true, bannedAt: true, mergedIntoUserId: true },
    })
    if (!user) return null
    if (!user.mergedIntoUserId) {
      if (currentId === userId || user.isDeleted || user.bannedAt) return null
      return { id: user.id, name: user.name, email: user.email, externalUserId: user.externalUserId }
    }
    currentId = user.mergedIntoUserId
  }
  return null
}
