import type { Prisma } from '@prisma/client'

/**
 * The one Prisma select for another user's identity (contract §3). A query
 * that shows someone else's name or avatar selects at least these fields, so
 * the badge flags cannot be forgotten on a new surface.
 */
export const USER_IDENTITY_SELECT = {
  id: true,
  handle: true,
  name: true,
  image: true,
  imageCropScale: true,
  imageCropX: true,
  imageCropY: true,
  isOfficial: true,
  isOperator: true,
} satisfies Prisma.UserSelect

export type UserIdentityRecord = Prisma.UserGetPayload<{ select: typeof USER_IDENTITY_SELECT }>

/** Wire flags next to an identity. Each key is present only when true. */
export type IdentityBadgeFlags = { isOfficial?: true }

/**
 * Badge flags for a DTO carrying another user's identity: spread it next to
 * the name (`{ ...identityBadgeFlags(user) }`). Ordinary users add nothing to
 * the payload. Clients pick the badge with `resolveAccountBadge`.
 */
export function identityBadgeFlags(
  user: { isOfficial?: boolean | null } | null | undefined,
): IdentityBadgeFlags {
  return {
    ...(user?.isOfficial ? { isOfficial: true as const } : {}),
  }
}
