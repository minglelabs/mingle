'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Shared chrome of the compose surfaces (new post, drafts, edit): one header
 * layout and one primary button, so the three screens line up exactly.
 */

/** Three-slot top bar: a leading action, a centred title, a trailing action. */
export function ComposeHeader({
  leading,
  title,
  trailing,
}: {
  leading: ReactNode
  title: string
  trailing?: ReactNode
}) {
  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-foreground/10 px-2">
      <div className="relative z-10 flex min-w-0 items-center">{leading}</div>
      <h1 className="pointer-events-none absolute inset-x-0 truncate px-24 text-center text-[17px] font-bold">
        {title}
      </h1>
      <div className="relative z-10 flex min-w-0 items-center justify-end">{trailing}</div>
    </header>
  )
}

/** Plain text action in the header (Cancel). */
export function ComposeHeaderTextButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center rounded-full px-3 text-[16px] text-foreground transition active:bg-foreground/5"
    >
      {children}
    </button>
  )
}

/** The one filled action of a compose surface (Post / Save). */
export function ComposePrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 min-w-[4.5rem] items-center justify-center rounded-full bg-primary px-5 text-[15px] font-bold text-primary-foreground transition active:scale-95 disabled:bg-foreground/10 disabled:text-foreground/35"
    >
      {children}
    </button>
  )
}

/**
 * Height of the on-screen keyboard over the layout viewport, so a bottom bar
 * can stay above it (the same rule the comment sheet's composer uses).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const viewport = window.visualViewport
    const measure = () => {
      setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)))
    }
    const initial = window.requestAnimationFrame(measure)
    viewport.addEventListener('resize', measure)
    viewport.addEventListener('scroll', measure)
    return () => {
      window.cancelAnimationFrame(initial)
      viewport.removeEventListener('resize', measure)
      viewport.removeEventListener('scroll', measure)
    }
  }, [])
  return inset
}
