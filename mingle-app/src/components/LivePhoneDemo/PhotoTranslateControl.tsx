'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Languages, Loader2 } from 'lucide-react'
import type { ConversationImageCopy } from '@/i18n/conversation-image-copy'
import { registerNativeBackHandler } from '@/lib/native-back-handler'
import { getSttLanguageDisplayName } from '@/lib/stt-languages'
import {
  PHOTO_TRANSLATION_OFF,
  nextPhotoTranslationChoice,
  type PhotoTranslationChoice,
  type PhotoTranslationOption,
} from './photo-translation-toggle.logic'

/** Same long-press timing as the chat bubble copy menu (CopyableBubbleSurface). */
export const PHOTO_TRANSLATE_LONG_PRESS_MS = 450
export const PHOTO_TRANSLATE_LONG_PRESS_SLOP_PX = 10
/** How long a synthesized click after a long press or drag is swallowed. */
const CLICK_SUPPRESS_MS = 400
/** Above the viewer (45) so Android back closes the menu first. */
const MENU_BACK_PRIORITY = 50

export function photoTranslationChoiceLabel(choice: PhotoTranslationChoice, uiLocale: string, copy: Pick<ConversationImageCopy, 'original'>): string {
  if (choice === PHOTO_TRANSLATION_OFF) return copy.original
  return getSttLanguageDisplayName(choice, uiLocale) ?? choice
}

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation()
}

type Press = {
  pointerId: number
  x: number
  y: number
  timer: ReturnType<typeof setTimeout> | null
  longPressed: boolean
  moved: boolean
}

type PhotoTranslateMenuProps = {
  id: string
  options: readonly PhotoTranslationOption[]
  choice: PhotoTranslationChoice
  highlighted: PhotoTranslationChoice | null
  uiLocale: string
  copy: ConversationImageCopy
  onSelect: (choice: PhotoTranslationChoice) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}

/**
 * The long-press menu: every room language in toggle order (non-eligible
 * ones disabled; "Same as original" unless the translation failed), a
 * divider, then "Show original". Rendered inside the viewer panel, above the
 * pill: a body portal would sit under the viewer (z 9999 < 10010).
 */
export function PhotoTranslateMenu({ id, options, choice, highlighted, uiLocale, copy, onSelect, onKeyDown }: PhotoTranslateMenuProps) {
  const row = (value: PhotoTranslationChoice, label: string, enabled: boolean, tag: string | null, pending: boolean) => {
    const checked = value === choice
    return <button key={value} type="button" role="menuitemradio" aria-checked={checked} aria-disabled={!enabled || undefined}
      disabled={!enabled} tabIndex={-1} data-photo-translate-option={value}
      onClick={event => { event.stopPropagation(); if (enabled) onSelect(value) }}
      className={`flex h-11 w-full items-center gap-2.5 px-3.5 text-left text-[15px] text-white outline-none transition-colors duration-150 focus-visible:bg-white/15 disabled:opacity-40 ${
        highlighted === value ? 'bg-white/15' : 'enabled:hover:bg-white/10 enabled:active:bg-white/15'}`}>
      <span className="flex w-[18px] shrink-0 justify-center" aria-hidden="true">
        {checked ? <Check size={17} strokeWidth={2.6} className="text-amber-400" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {pending ? <Loader2 size={14} className="shrink-0 animate-spin text-white/60" aria-hidden="true" /> : null}
      {tag ? <span className="shrink-0 pl-2 text-[12px] text-white/70">{tag}</span> : null}
    </button>
  }
  return <div id={id} role="menu" aria-label={copy.translate} aria-orientation="vertical" onKeyDown={onKeyDown}
    className="min-w-[13rem] max-w-[min(18rem,calc(100vw-3rem))] overflow-y-auto overscroll-contain rounded-2xl bg-[rgba(28,28,30,0.94)] py-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur-xl"
    style={{ maxHeight: 'min(24rem, calc(80dvh - 4.5rem))' }}>
    {options.map(option => row(
      option.language,
      photoTranslationChoiceLabel(option.language, uiLocale, copy),
      option.eligible,
      !option.eligible && option.state === 'same' ? copy.sameAsOriginal : null,
      option.eligible && option.state === 'pending',
    ))}
    <div role="separator" className="mx-3.5 my-1.5 h-px bg-white/10" />
    {row(PHOTO_TRANSLATION_OFF, copy.showOriginal, true, null, false)}
  </div>
}

type PhotoTranslateControlProps = {
  options: readonly PhotoTranslationOption[]
  cycle: readonly PhotoTranslationChoice[]
  choice: PhotoTranslationChoice
  /** The shown language is still being translated. */
  pending: boolean
  uiLocale: string
  copy: ConversationImageCopy
  /** While the viewer is being dismissed. */
  disabled?: boolean
  onSelect: (choice: PhotoTranslationChoice) => void
}

/**
 * The language pill (option A): a sibling of the zoom viewport, never inside
 * it, since the viewport captures pointers for pan/dismiss. Tap cycles the
 * eligible languages and Original. Long-press (450 ms, 10 px slop) opens the
 * menu; press-drag-release picks the row under the finger, and releasing on
 * the pill keeps the menu open for a tap.
 */
export default function PhotoTranslateControl({ options, cycle, choice, pending, uiLocale, copy, disabled = false, onSelect }: PhotoTranslateControlProps) {
  const menuId = useId()
  const reducedMotion = useReducedMotion() ?? false
  const rootRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pressRef = useRef<Press | null>(null)
  const suppressClickRef = useRef(false)
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusMenuOnOpenRef = useRef(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [highlighted, setHighlighted] = useState<PhotoTranslationChoice | null>(null)
  const open = menuOpen && !disabled

  const clearPressTimer = useCallback(() => {
    const press = pressRef.current
    if (press?.timer) {
      clearTimeout(press.timer)
      press.timer = null
    }
  }, [])

  const clearSuppressTimer = useCallback(() => {
    if (suppressTimerRef.current) {
      clearTimeout(suppressTimerRef.current)
      suppressTimerRef.current = null
    }
  }, [])

  // The click a touch would synthesize after a long press or drag must not
  // cycle the pill (or land on whatever is under the finger).
  const suppressNextClick = useCallback(() => {
    suppressClickRef.current = true
    clearSuppressTimer()
    suppressTimerRef.current = setTimeout(() => {
      suppressTimerRef.current = null
      suppressClickRef.current = false
    }, CLICK_SUPPRESS_MS)
  }, [clearSuppressTimer])

  useEffect(() => () => { clearPressTimer(); clearSuppressTimer() }, [clearPressTimer, clearSuppressTimer])

  const closeMenu = useCallback((focusPill: boolean) => {
    setMenuOpen(false)
    setHighlighted(null)
    if (focusPill) pillRef.current?.focus({ preventScroll: true })
  }, [])

  const select = useCallback((value: PhotoTranslationChoice, focusPill: boolean) => {
    onSelect(value)
    closeMenu(focusPill)
  }, [closeMenu, onSelect])

  // Outside tap, Escape (window capture beats the viewer's document capture)
  // and Android back close the menu; the viewer stays open.
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      // The tap only closes the menu: it must not start a pan or close the viewer.
      event.stopPropagation()
      closeMenu(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown, true)
    const unregisterBack = registerNativeBackHandler(() => { closeMenu(false); return true }, MENU_BACK_PRIORITY)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown, true)
      unregisterBack()
    }
  }, [closeMenu, open])

  // A keyboard-opened menu moves focus to the checked row (or the first enabled one).
  useEffect(() => {
    if (!open || !focusMenuOnOpenRef.current) return
    focusMenuOnOpenRef.current = false
    const rows = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[data-photo-translate-option]:not(:disabled)') ?? [])]
    const target = rows.find(row => row.getAttribute('aria-checked') === 'true') ?? rows[0]
    target?.focus({ preventScroll: true })
  }, [open])

  const openMenu = useCallback((fromKeyboard: boolean) => {
    focusMenuOnOpenRef.current = fromKeyboard
    setHighlighted(null)
    setMenuOpen(true)
  }, [])

  const optionAt = useCallback((x: number, y: number): PhotoTranslationChoice | null => {
    if (typeof document.elementFromPoint !== 'function') return null
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-photo-translate-option]')
    if (!row || !menuRef.current?.contains(row) || row.getAttribute('aria-disabled') === 'true') return null
    return row.dataset.photoTranslateOption ?? null
  }, [])

  const isOverPill = useCallback((x: number, y: number) => {
    const element = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null
    return Boolean(element && pillRef.current?.contains(element))
  }, [])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (disabled || event.button !== 0) return
    clearPressTimer()
    clearSuppressTimer()
    suppressClickRef.current = false
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const press: Press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer: null, longPressed: false, moved: false }
    press.timer = setTimeout(() => {
      press.timer = null
      press.longPressed = true
      suppressClickRef.current = true
      openMenu(false)
    }, PHOTO_TRANSLATE_LONG_PRESS_MS)
    pressRef.current = press
  }, [clearPressTimer, clearSuppressTimer, disabled, openMenu])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return
    if (!press.longPressed && !press.moved
      && Math.hypot(event.clientX - press.x, event.clientY - press.y) > PHOTO_TRANSLATE_LONG_PRESS_SLOP_PX) {
      press.moved = true
      clearPressTimer()
    }
    if (press.longPressed || open) {
      const next = optionAt(event.clientX, event.clientY)
      setHighlighted(current => (current === next ? current : next))
    }
  }, [clearPressTimer, open, optionAt])

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return
    // Cancel the long-press timer before dropping the press: a tap must not
    // open the menu 450 ms later.
    clearPressTimer()
    pressRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (press.longPressed || open) {
      // Press-drag-release: the row under the finger wins.
      const option = optionAt(event.clientX, event.clientY)
      if (option) {
        suppressNextClick()
        select(option, false)
        return
      }
    }
    if (press.longPressed) {
      suppressNextClick()
      // Released on the pill: keep the menu open for a tap. Anywhere else closes it.
      if (isOverPill(event.clientX, event.clientY)) setHighlighted(null)
      else closeMenu(false)
      return
    }
    // A drag that was not a long press is not a tap either.
    if (press.moved) suppressNextClick()
  }, [clearPressTimer, closeMenu, isOverPill, open, optionAt, select, suppressNextClick])

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (pressRef.current?.pointerId !== event.pointerId) return
    clearPressTimer()
    pressRef.current = null
    setHighlighted(null)
  }, [clearPressTimer])

  // React's onTouchEnd is not passive: cancelling here stops WKWebView from
  // synthesizing a click under the finger after a long press or drag.
  const handleTouchEnd = useCallback((event: ReactTouchEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (suppressClickRef.current && event.cancelable) event.preventDefault()
  }, [])

  const handleClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      clearSuppressTimer()
      return
    }
    if (disabled) return
    if (open) {
      closeMenu(false)
      return
    }
    onSelect(nextPhotoTranslationChoice(cycle, choice))
  }, [choice, clearSuppressTimer, closeMenu, cycle, disabled, onSelect, open])

  // Android long-press and desktop right-click. The timer usually opened the
  // menu already; either way the release must not count as a tap.
  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    const press = pressRef.current
    if (press) {
      clearPressTimer()
      press.longPressed = true
      suppressClickRef.current = true
    }
    if (!open) openMenu(false)
  }, [clearPressTimer, disabled, open, openMenu])

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10') || (event.altKey && event.key === 'ArrowDown')) {
      event.preventDefault()
      event.stopPropagation()
      if (!disabled) openMenu(true)
    }
  }, [disabled, openMenu])

  const handleMenuKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const rows = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[data-photo-translate-option]:not(:disabled)') ?? [])]
    if (!rows.length) return
    const index = rows.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? rows.length - 1
        : event.key === 'ArrowDown' ? (index + 1) % rows.length
          : (index <= 0 ? rows.length : index) - 1
    rows[next]?.focus({ preventScroll: true })
  }, [])

  const label = photoTranslationChoiceLabel(choice, uiLocale, copy)
  const labels = [...new Set([...cycle.map(value => photoTranslationChoiceLabel(value, uiLocale, copy)), label])]
  const ariaLabel = `${copy.translate}: ${label}${pending ? `, ${copy.translating}` : ''}. ${copy.translateHint}`
  const fade = reducedMotion ? 'transition-none' : 'transition-opacity duration-[180ms]'

  return <div ref={rootRef} className="relative"
    onPointerDown={stopPropagation} onTouchStart={stopPropagation} onTouchMove={stopPropagation}
    onTouchEnd={stopPropagation} onDoubleClick={stopPropagation}>
    <AnimatePresence>
      {open && <motion.div ref={menuRef} className="absolute bottom-[calc(100%+0.5rem)] right-0 origin-bottom-right"
        initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 6, scale: 0.985 }}
        transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}>
        <PhotoTranslateMenu id={menuId} options={options} choice={choice} highlighted={highlighted} uiLocale={uiLocale} copy={copy}
          onSelect={value => select(value, true)} onKeyDown={handleMenuKeyDown} />
      </motion.div>}
    </AnimatePresence>
    <button ref={pillRef} type="button" data-photo-translate-pill disabled={disabled}
      aria-label={ariaLabel} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel} onTouchStart={stopPropagation} onTouchEnd={handleTouchEnd}
      onDoubleClick={stopPropagation} onClick={handleClick} onContextMenu={handleContextMenu} onKeyDown={handleKeyDown}
      className="flex h-11 max-w-[min(15rem,calc(100vw-7rem))] touch-none select-none items-center gap-1.5 rounded-full bg-white/15 pl-3 pr-3.5 text-[14px] font-semibold text-white backdrop-blur-md transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 active:scale-[0.97] disabled:opacity-60"
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
      <span className="relative flex h-[17px] w-[17px] shrink-0 items-center justify-center" aria-hidden="true">
        <Languages size={17} className={`absolute ${fade} ${pending ? 'opacity-0' : 'opacity-100'}`} />
        <Loader2 size={15} className={`absolute animate-spin ${fade} ${pending ? 'opacity-100' : 'opacity-0'}`} />
      </span>
      {/* Every label shares one grid cell: the pill keeps the widest width, so
          cycling never makes it jump, and labels cross-fade in place. */}
      <span className="grid min-w-0" aria-hidden="true">
        {labels.map(text => <span key={text} className={`col-start-1 row-start-1 truncate ${fade} ${text === label ? 'opacity-100' : 'opacity-0'}`}>{text}</span>)}
      </span>
    </button>
  </div>
}
