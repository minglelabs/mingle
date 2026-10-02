import { identityBadgeFlags, type IdentityBadgeFlags } from './user-identity-select'

/** The identity columns a list row reads (select them with `USER_IDENTITY_SELECT`). */
export type ListUserIdentityRow<THandle extends string | null = string> = {
  id: string
  handle: THandle
  name: string | null
  image: string | null
  isOfficial?: boolean | null
  isOperator?: boolean | null
}

/** Wire shape: id, handle, name, avatar URL, plus the badge flags only when true. */
export type ListUserIdentity<THandle extends string | null = string> = {
  id: string
  handle: THandle
  name: string | null
  image: string | null
} & IdentityBadgeFlags

/**
 * The compact identity a non-chat list row sends for another user: comment
 * author, notification actor, followers / following / invite lists, blocked
 * users and my reports (contract §3). Ordinary users add no flag to the
 * payload; clients pick the badge with `resolveAccountBadge`.
 */
export function serializeListUserIdentity<THandle extends string | null>(
  user: ListUserIdentityRow<THandle>,
): ListUserIdentity<THandle> {
  return {
    id: user.id,
    handle: user.handle,
    name: user.name,
    image: user.image,
    ...identityBadgeFlags(user),
  }
}
