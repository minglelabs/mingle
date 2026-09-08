'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { registerNativeBackHandler } from '@/lib/native-back-handler'

export default function MessageMediaDialog({ title, onClose, children, dark = false }: { title: string; onClose: () => void; children: ReactNode; dark?: boolean }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus({ preventScroll: true })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      if (event.key === 'Tab') {
        const buttons = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? [])]
        const first = buttons[0], last = buttons.at(-1)
        if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement) || document.activeElement === panel.current)) { event.preventDefault(); (last ?? panel.current)?.focus() }
        if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement) || document.activeElement === panel.current)) { event.preventDefault(); (first ?? panel.current)?.focus() }
      }
    }
    document.addEventListener('keydown', keydown, true)
    const unregister = registerNativeBackHandler(() => { onClose(); return true }, 45)
    return () => { document.removeEventListener('keydown', keydown, true); unregister(); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [onClose, title])
  return createPortal(<div className={`fixed inset-0 z-[10010] flex items-center justify-center p-4 ${dark ? 'bg-black/95' : 'bg-black/40'}`}
    onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
      className={`flex max-h-[85dvh] w-full ${dark ? 'max-w-4xl text-white' : 'max-w-sm rounded-3xl bg-white p-4 text-slate-900'} flex-col overflow-y-auto overscroll-contain outline-none`}>
      {children}
    </div>
  </div>, document.body)
}
