import type { OperatorPostIdentity } from '@/server/operator-posts/types'

const SIZE = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm' } as const

/** Round profile photo, or the first letter of the name on slate when there is none. */
export default function OperatorAvatar({
  operator,
  size = 'md',
}: {
  operator: Pick<OperatorPostIdentity, 'name' | 'handle' | 'image'> | null
  size?: keyof typeof SIZE
}) {
  const initial = (operator?.name?.trim() || operator?.handle || '?').slice(0, 1).toUpperCase()
  if (operator?.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={operator.image}
        alt=""
        className={`${SIZE[size]} shrink-0 rounded-full bg-slate-200 object-cover`}
        loading="lazy"
      />
    )
  }
  return (
    <span
      aria-hidden
      className={`${SIZE[size]} inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600`}
    >
      {initial}
    </span>
  )
}
