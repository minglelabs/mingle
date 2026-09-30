import { BadgeCheck, UsersRound } from 'lucide-react'
import { accountBadgeCopy } from '@/i18n/account-badge-copy'
import type { AccountBadgeKind } from '@/lib/account-badge'

type ChatAccountBadgeProps = {
  kind: AccountBadgeKind
  locale: string
  /**
   * `light` = on a dark surface or photo (white badge), `dark` = on a light
   * surface. Every chat surface today is light.
   */
  tone?: 'light' | 'dark'
}

/**
 * The account badge on chat surfaces (list row, room header, bubble sender
 * name, participants, reactions). Same props and look as the shared
 * `<AccountBadge>` (components/posts), which replaces it once both exist on
 * one branch. Pick `kind` with `resolveAccountBadge` / the helpers in
 * `chat-account-badge.logic.ts`; render nothing when there is no badge.
 *
 * Deliberately non-interactive: several chat placements sit inside a
 * row-sized `<button>` (list row, participant row), where a second tap target
 * would nest interactive elements. The label is read by screen readers
 * through the sr-only description, which also joins the parent button's name.
 */
export default function ChatAccountBadge({ kind, locale, tone = 'dark' }: ChatAccountBadgeProps) {
  const copy = accountBadgeCopy(locale)
  const label = kind === 'operator' ? copy.operator : copy.official
  const description = kind === 'operator' ? copy.operatorDescription : copy.officialDescription
  const Icon = kind === 'operator' ? UsersRound : BadgeCheck
  const toneClass = tone === 'light'
    ? 'bg-white/20 text-white ring-1 ring-white/40'
    : 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
  return (
    <span
      data-account-badge={kind}
      className={`inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${toneClass}`}
      title={description}
    >
      <Icon size={11} strokeWidth={2.4} aria-hidden="true" />
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{description}</span>
    </span>
  )
}
