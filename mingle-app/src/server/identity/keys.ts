import { createHmac } from 'node:crypto'

// One account per person (docs/one-account-per-person.md). Devices, numbers
// and sign-in methods are stored only as an HMAC made with a server secret,
// so a leaked table gives away no number, e-mail or device value.
//
// IDENTITY_HASH_SECRET must never change once rows exist: every stored key
// would stop matching. Without it the NextAuth secret is used.

export type IdentityMethod = 'apple' | 'google' | 'email' | 'phone'
export type IdentityKeyKind = IdentityMethod | 'device'

/** Device values that survive a reinstall. Only these decide anything. */
export const STRONG_DEVICE_KEY_KINDS = ['keychain', 'android_id'] as const
export type DeviceKeyKind = (typeof STRONG_DEVICE_KEY_KINDS)[number] | 'web_local' | 'push_installation'

export function isStrongDeviceKeyKind(kind: string | null | undefined): boolean {
  return (STRONG_DEVICE_KEY_KINDS as readonly string[]).includes(kind ?? '')
}

function readSecret(env: NodeJS.ProcessEnv): string {
  return env.IDENTITY_HASH_SECRET?.trim() || env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim() || 'hashchat-dev-identity-secret'
}

/** The stored key of one identity value. The kind is mixed in, so a phone and an e-mail can never collide. */
export function identityKeyHash(kind: IdentityKeyKind, rawValue: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = kind === 'email' ? rawValue.trim().toLowerCase() : rawValue.trim()
  return createHmac('sha256', readSecret(env)).update(`${kind}:${value}`).digest('hex')
}

/** 'apple' | 'google' for an OAuth provider id, null for anything else. */
export function identityMethodForProvider(provider: string | null | undefined): 'apple' | 'google' | null {
  const id = (provider ?? '').trim().toLowerCase()
  return id === 'apple' || id === 'google' ? id : null
}

/** Whether the device rules are on. DEVICE_LINK=off turns them off in an emergency; numbers and sign-in methods still link. */
export function isDeviceLinkOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return !['0', 'off', 'false', 'no'].includes((env.DEVICE_LINK ?? '').trim().toLowerCase())
}
