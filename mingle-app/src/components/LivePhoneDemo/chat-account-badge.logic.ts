import {
  resolveAccountBadge,
  withAccountBadgeLabel,
  type AccountBadgeFlags,
  type AccountBadgeKind,
} from '@/lib/account-badge'

/**
 * Reads an account badge carried on the wire as a kind ('official'): hydration/live `speakerBadge`, invite-notice badges. Any other
 * value (older payloads, cached rows, garbage) means no badge.
 */
export function readAccountBadgeKind(value: unknown): AccountBadgeKind | null {
  return value === 'official' ? value : null
}

/** Flags carried on the wire next to an identity, keeping only `true`. */
export function readAccountBadgeFlags(record: Record<string, unknown> | null | undefined): {
  isOfficial?: true
  isOperator?: true
} {
  return {
    ...(record?.isOfficial === true ? { isOfficial: true as const } : {}),
    ...(record?.isOperator === true ? { isOperator: true as const } : {}),
  }
}

/**
 * The one badge a room-level label (chat list row title, room header) shows:
 * the badge of the room's OTHER members. Room titles are renamable plain
 * strings, so the label sits next to the title and is never written into it.
 */
export function resolveRoomAccountBadge(
  otherMembers: readonly AccountBadgeFlags[] | null | undefined,
): AccountBadgeKind | null {
  let badge: AccountBadgeKind | null = null
  for (const member of otherMembers ?? []) {
    const kind = resolveAccountBadge(member)
    if (kind === 'official') badge = 'official'
  }
  return badge
}

/**
 * Plain-text name for notices rendered as a sentence ("Mina (운영 계정)
 * invited Bob"), where a badge chip cannot sit inside the copy template.
 * Empty names stay empty so the notice's own "no name" guard still applies.
 */
export function labelNameWithAccountBadge(
  name: string,
  kind: AccountBadgeKind | null | undefined,
  locale: string,
): string {
  return name ? withAccountBadgeLabel(name, kind, locale) : name
}
