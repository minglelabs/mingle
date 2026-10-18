import type { ReactNode } from 'react'
import ProfileLanguageFlagStack from '@/components/profile-language-flag-stack'

/**
 * Presentational pieces shared by the operator admin pages. Phone-first
 * (375 px), slate neutrals + sky accent. `OperatorsMain` only sets the page
 * width; the admin shell owns the one scroll container.
 */

export function OperatorsMain({ children }: { children: ReactNode }) {
  return (
    <main className="w-full bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-2xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-[calc(1rem+env(safe-area-inset-top,0px))]">
        {children}
      </div>
    </main>
  )
}

/** Staff-side marker; users see the 15-language `<AccountBadge>` instead. */
export function OperatorChip() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold leading-4 text-sky-700">
      운영 계정
    </span>
  )
}

export function InactiveChip() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold leading-4 text-slate-600">
      비활성
    </span>
  )
}

/** The account's photo; with `languages`, their primary-language flags sit on it as in the app. */
export function OperatorAvatar({ image, name, size = 48, languages }: { image: string | null; name: string | null; size?: number; languages?: readonly string[] }) {
  if (languages?.length) {
    return (
      <span className="relative inline-flex shrink-0">
        <OperatorAvatar image={image} name={name} size={size} />
        <ProfileLanguageFlagStack languages={languages} size={size} />
      </span>
    )
  }
  const style = { width: size, height: size }
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" width={size} height={size} className="shrink-0 rounded-full bg-slate-200 object-cover" style={style} />
    )
  }
  const initial = Array.from(name?.trim() ?? '')[0] ?? '?'
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-500"
      style={{ ...style, fontSize: Math.max(12, Math.round(size * 0.4)) }}
    >
      {initial}
    </span>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode }) {
  const toneClass = {
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    error: 'border-rose-200 bg-rose-50 text-rose-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
  }[tone]
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`break-words rounded-xl border px-3 py-2.5 text-sm leading-5 ${toneClass}`}>
      {children}
    </p>
  )
}
