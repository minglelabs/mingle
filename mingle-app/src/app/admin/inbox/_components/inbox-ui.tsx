'use client'

import { BadgeCheck, UserRound } from 'lucide-react'
import { accountBadgeCopy } from '@/i18n/account-badge-copy'
import { resolveAccountBadge } from '@/lib/account-badge'
import { buildProfileImageTransform } from '@/lib/profile-image-crop'
import type { InboxPerson } from '@/server/operator-inbox/inbox'
import { inboxPersonLabel } from '../_lib/inbox-format'

const KO_BADGE_COPY = accountBadgeCopy('ko')

/** Round profile photo with the account's saved crop, or a neutral placeholder. */
export function InboxAvatar({ person, size = 48 }: { person: InboxPerson | null | undefined; size?: number }) {
  const label = inboxPersonLabel(person)
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100"
      style={{ width: size, height: size }}
    >
      {person?.image ? (
        // Profile photos are external/signed URLs; next/image optimization is not configured for them.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.image}
          alt={label}
          width={size}
          height={size}
          loading="lazy"
          className="h-full w-full object-cover"
          style={{
            transform: buildProfileImageTransform(size, {
              scale: person.imageCropScale,
              x: person.imageCropX,
              y: person.imageCropY,
            }),
          }}
        />
      ) : (
        <UserRound size={Math.round(size * 0.5)} className="text-slate-400" aria-label={label} />
      )}
    </span>
  )
}

/**
 * The badge a user would see next to this account ("공식"), for
 * counterparts that are themselves official accounts.
 */
export function InboxAccountTag({ person }: { person: Pick<InboxPerson, 'isOfficial'> }) {
  const kind = resolveAccountBadge(person)
  if (!kind) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-sky-700 ring-1 ring-sky-200">
      <BadgeCheck size={11} strokeWidth={2.4} aria-hidden="true" />
      {KO_BADGE_COPY.official}
    </span>
  )
}

/** "운영 계정 · Mina": which operator account a room is answered as. */
export function OperatorChip({ operator, className }: { operator: InboxPerson; className?: string }) {
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-200 ${className ?? ''}`}
    >
      <BadgeCheck size={12} strokeWidth={2.4} className="shrink-0" aria-hidden="true" />
      <span className="shrink-0">{KO_BADGE_COPY.operator}</span>
      <span aria-hidden="true" className="shrink-0 text-sky-400">·</span>
      <span className="truncate">{inboxPersonLabel(operator)}</span>
    </span>
  )
}

/** The "한국어로 보기" switch (44 px tall touch target). */
export function KoreanViewSwitch({ enabled, onChange }: { enabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-2 text-sm font-medium text-slate-700 active:bg-slate-100"
    >
      <span>한국어로 보기</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${enabled ? 'bg-sky-500' : 'bg-slate-300'}`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'}`}
        />
      </span>
    </button>
  )
}
