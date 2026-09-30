import { accountBadgeCopy } from '@/i18n/account-badge-copy'

/**
 * The one rule for which badge an account carries (contract §3). Every surface
 * that shows another user's name renders through this (plus `<AccountBadge>`),
 * never by reading `isOfficial` / `isOperator` itself.
 *
 * - `operator`: run by Mingle staff, labeled "운영 계정" / "Run by Mingle".
 * - `official`: the Mingle team's own account, labeled "공식" / "Official".
 *
 * An account is never both (DB check `app_users_operator_not_official_chk`);
 * should a row ever carry both flags, the operator label wins so a staff-run
 * account is never shown as merely official.
 */
export type AccountBadgeKind = 'official' | 'operator'

export type AccountBadgeFlags = {
  isOfficial?: boolean | null
  isOperator?: boolean | null
}

export function resolveAccountBadge(flags: AccountBadgeFlags | null | undefined): AccountBadgeKind | null {
  if (flags?.isOperator) return 'operator'
  if (flags?.isOfficial) return 'official'
  return null
}

/**
 * Name plus badge as plain text, for surfaces that cannot render the badge
 * component (OS push, share text): "Mina (운영 계정)" / "Mina (Run by Mingle)".
 * `locale` is any language tag (unknown -> English). Without a badge the label
 * is returned unchanged.
 */
export function withAccountBadgeLabel(label: string, kind: AccountBadgeKind | null | undefined, locale: string): string {
  if (!kind) return label
  const copy = accountBadgeCopy(locale)
  return `${label} (${kind === 'operator' ? copy.pushLabel : copy.official})`
}
