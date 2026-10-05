import { accountBadgeCopy } from '@/i18n/account-badge-copy'

/**
 * The one rule for which badge an account carries. Every surface that shows
 * another user's name renders through this (plus `<AccountBadge>`), never by
 * reading `isOfficial` itself.
 *
 * - `official`: the Mingle team's own account, labeled "공식" / "Official".
 */
export type AccountBadgeKind = 'official'

export type AccountBadgeFlags = {
  isOfficial?: boolean | null
}

export function resolveAccountBadge(flags: AccountBadgeFlags | null | undefined): AccountBadgeKind | null {
  if (flags?.isOfficial) return 'official'
  return null
}

/**
 * Name plus badge as plain text, for surfaces that cannot render the badge
 * component (OS push, share text): "Mingle Team (공식)" / "Mingle Team (Official)".
 * `locale` is any language tag (unknown -> English). Without a badge the label
 * is returned unchanged.
 */
export function withAccountBadgeLabel(label: string, kind: AccountBadgeKind | null | undefined, locale: string): string {
  if (!kind) return label
  const copy = accountBadgeCopy(locale)
  return `${label} (${copy.official})`
}
