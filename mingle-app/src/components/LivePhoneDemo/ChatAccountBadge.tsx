import AccountBadge from '@/components/posts/account-badge'
import type { AccountBadgeKind } from '@/lib/account-badge'

type ChatAccountBadgeProps = {
  kind: AccountBadgeKind
  locale: string
  /** `light` = on a dark surface or photo; chat surfaces usually use `dark`. */
  tone?: 'light' | 'dark'
}

/**
 * W4 adapter retained for chat call sites. The shared W3 badge owns the label,
 * accessible name, 44px target, and operator explanation sheet.
 */
export default function ChatAccountBadge({ kind, locale, tone = 'dark' }: ChatAccountBadgeProps) {
  return <AccountBadge kind={kind} locale={locale} tone={tone} />
}
