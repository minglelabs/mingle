import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { overlayBlocksFor } from '@/lib/conversation-image-text'
import { resolveConversationImageCopy } from '@/i18n/conversation-image-copy'
import PhotoTranslateControl, { PHOTO_TRANSLATE_LONG_PRESS_MS, PHOTO_TRANSLATE_LONG_PRESS_SLOP_PX, PhotoTranslateMenu } from './PhotoTranslateControl'
import PhotoTranslationOverlay from './PhotoTranslationOverlay'
import { resolvePhotoTranslationToggle } from './photo-translation-toggle.logic'
import {
  photoTranslationKoreanOnlyResponse,
  photoTranslationReadyResponse,
  photoTranslationSettledResponse,
} from './photo-translation.fixtures'

const stage = { width: 1000, height: 750 }
const copy = resolveConversationImageCopy('ko')

function renderOverlay(language: string | null, response = photoTranslationReadyResponse) {
  return renderToStaticMarkup(createElement(PhotoTranslationOverlay, {
    ...stage,
    blocks: response.blocks,
    painted: overlayBlocksFor(response, language),
    language,
  }))
}

function blockMarkup(html: string, id: string): string {
  const start = html.indexOf(`data-photo-translation-block="${id}"`)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = html.indexOf('data-photo-translation-block=', start + 10)
  return html.slice(start, next < 0 ? undefined : next)
}

describe('PhotoTranslationOverlay', () => {
  it('lets pointers through and paints only translated blocks that change', () => {
    const html = renderOverlay('ko')
    expect(html).toContain('data-photo-translation-overlay')
    expect(html).toContain('pointer-events-none absolute inset-0 overflow-hidden')
    expect(html).toContain('aria-hidden="true"')
    expect(html.match(/data-photo-translation-block=/g)).toHaveLength(5)
    expect(html).not.toContain('data-photo-translation-block="b5"')
    expect(html).not.toContain('data-photo-translation-block="b6"')
    expect(html).toContain('오늘의 추천')
  })

  it('places blocks in percent of the stage and marks the text language', () => {
    const block = blockMarkup(renderOverlay('ko'), 'b0')
    expect(block).toMatch(/left:[\d.]+%;top:[\d.]+%;width:[\d.]+%;height:[\d.]+%/)
    expect(block).toContain('<span lang="ko" dir="auto">영업시간</span>')
    expect(block).toMatch(/font-size:[\d.]+px/)
    expect(block).toContain('white-space:nowrap')
    expect(block).toContain('word-break:keep-all')
    expect(block).toContain('direction:ltr')
    expect(block).toMatch(/justify-content:(center|flex-start|flex-end)/)
  })

  it('rotates rotated blocks and writes vertical blocks top to bottom for CJK targets', () => {
    const html = renderOverlay('ko')
    expect(blockMarkup(html, 'b4')).toContain('transform:rotate(12deg)')
    const vertical = blockMarkup(html, 'b3')
    expect(vertical).toContain('writing-mode:vertical-rl')
    expect(vertical).toContain('text-orientation:upright')
    const english = blockMarkup(renderOverlay('en', photoTranslationSettledResponse), 'b3')
    expect(english).not.toContain('writing-mode')
    expect(english).toContain('lang="en"')
  })

  it('uses the selected translucent glass label style for every translated block', () => {
    const html = renderOverlay('ko')
    const sign = blockMarkup(html, 'b2')
    expect(sign).toContain('data-photo-translation-paint="glass"')
    expect(sign).toContain('background-color:rgba(12, 14, 18, 0.66)')
    expect(sign).toContain('border-radius:5px')
    expect(sign).toContain('backdrop-filter:blur(6px)')
    expect(sign).toContain('color:#fff')
    expect(sign).toContain('padding-inline:4px')
  })

  it('paints nothing for the original photo', () => {
    expect(renderOverlay(null)).not.toContain('data-photo-translation-block')
  })
})

describe('PhotoTranslateMenu', () => {
  const toggle = resolvePhotoTranslationToggle({ order: ['ko', 'en', 'ja'], response: photoTranslationReadyResponse })

  function renderMenu(options = toggle.options, choice = toggle.choice) {
    return renderToStaticMarkup(createElement(PhotoTranslateMenu, {
      id: 'menu', options, choice, highlighted: null, uiLocale: 'ko', copy, onSelect: () => {},
    }))
  }

  it('lists every room language in order, then a divider and Show original', () => {
    const html = renderMenu()
    expect(html).toContain('role="menu"')
    expect(html.match(/role="menuitemradio"/g)).toHaveLength(4)
    expect(html).toContain('role="separator"')
    const order = ['data-photo-translate-option="ko"', 'data-photo-translate-option="en"', 'data-photo-translate-option="ja"', 'role="separator"', 'data-photo-translate-option="off"']
    const positions = order.map(marker => html.indexOf(marker))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect([...positions].sort((left, right) => left - right)).toEqual(positions)
    expect(html).toContain('한국어')
    expect(html).toContain(copy.showOriginal)
  })

  it('checks the current row, spins for a pending one and disables a failed one without the tag', () => {
    const html = renderMenu()
    expect(html).toMatch(/aria-checked="true"[^>]*data-photo-translate-option="ko"/)
    expect(html).toMatch(/aria-checked="false"[^>]*data-photo-translate-option="off"/)
    expect(html).toContain('text-amber-400')
    const english = html.slice(html.indexOf('data-photo-translate-option="en"'), html.indexOf('data-photo-translate-option="ja"'))
    expect(english).toContain('animate-spin')
    const japanese = html.slice(html.indexOf('data-photo-translate-option="ja"'), html.indexOf('role="separator"'))
    expect(html).toMatch(/aria-disabled="true" disabled="" tabindex="-1" data-photo-translate-option="ja"/)
    expect(japanese).not.toContain(copy.sameAsOriginal)
  })

  it('tags languages with nothing to translate as the same as the original', () => {
    const korean = resolvePhotoTranslationToggle({ order: ['ko', 'en'], response: photoTranslationKoreanOnlyResponse })
    const html = renderMenu(korean.options, korean.choice)
    expect(html).toMatch(/aria-disabled="true" disabled="" tabindex="-1" data-photo-translate-option="ko"/)
    expect(html).toContain(copy.sameAsOriginal)
    expect(html).toMatch(/aria-checked="true"[^>]*data-photo-translate-option="off"/)
  })
})

describe('PhotoTranslateControl', () => {
  function renderPill(selection?: string) {
    const toggle = resolvePhotoTranslationToggle({ order: ['ko', 'en', 'ja'], response: photoTranslationReadyResponse, selection })
    return renderToStaticMarkup(createElement(PhotoTranslateControl, {
      options: toggle.options, cycle: toggle.cycle, choice: toggle.choice, pending: toggle.pending,
      uiLocale: 'ko', copy, onSelect: () => {},
    }))
  }

  it('renders a 44 px pill with the current language and the long-press hint in its label', () => {
    const html = renderPill()
    expect(html).toContain('data-photo-translate-pill')
    expect(html).toContain(`aria-label="${copy.translate}: 한국어. ${copy.translateHint}"`)
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('h-11')
    expect(html).toContain('touch-none')
    expect(html).toContain('background-color:rgba(255,255,255,0.16)')
    expect(html).toContain('backdrop-filter:blur(10px)')
    expect(html).toContain('data-photo-translate-cycle-dots')
    expect(html.match(/rounded-full bg-white/g)).toHaveLength(3)
    expect(html).toContain('flex-col')
    expect(html).not.toContain('role="menu"')
  })

  it('reserves the widest label so cycling never changes the pill width', () => {
    const html = renderPill()
    for (const label of ['한국어', '영어', copy.original]) expect(html).toContain(`>${label}</span>`)
    expect(html.match(/col-start-1 row-start-1/g)).toHaveLength(3)
  })

  it('announces and shows a spinner while the shown language is pending', () => {
    const html = renderPill('en')
    expect(html).toContain(`aria-label="${copy.translate}: 영어, ${copy.translating}. ${copy.translateHint}"`)
    expect(html).toMatch(/animate-spin[^"]*opacity-100/)
  })
})

describe('PhotoTranslateControl event contract', () => {
  const source = readFileSync(new URL('./PhotoTranslateControl.tsx', import.meta.url), 'utf8')

  function sourceBetween(startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start + startMarker.length)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
  }

  it('uses the chat bubble long-press timing', () => {
    expect(PHOTO_TRANSLATE_LONG_PRESS_MS).toBe(450)
    expect(PHOTO_TRANSLATE_LONG_PRESS_SLOP_PX).toBe(10)
  })

  it('keeps pill events from reaching the viewport and the chat list behind the portal', () => {
    const pill = sourceBetween('<button ref={pillRef}', 'className="flex h-11')
    for (const handler of ['onPointerDown={handlePointerDown}', 'onTouchStart={stopPropagation}', 'onTouchEnd={handleTouchEnd}', 'onDoubleClick={stopPropagation}', 'onContextMenu={handleContextMenu}']) {
      expect(pill).toContain(handler)
    }
    expect(sourceBetween('const handlePointerDown = useCallback', 'const handlePointerMove')).toContain('event.stopPropagation()')
    const root = sourceBetween('return <div ref={rootRef}', '<AnimatePresence>')
    expect(root).toContain('onTouchMove={stopPropagation}')
  })

  it('cancels the synthesized click after a long press or drag', () => {
    const touchEnd = sourceBetween('const handleTouchEnd = useCallback', 'const handleClick')
    expect(touchEnd).toContain('if (suppressClickRef.current && event.cancelable) event.preventDefault()')
    expect(sourceBetween('const handleClick = useCallback', 'const handleContextMenu')).toContain('if (suppressClickRef.current)')
  })

  it('selects the row under the finger on release and keeps the menu open on the pill', () => {
    const up = sourceBetween('const handlePointerUp = useCallback', 'const handlePointerCancel')
    expect(up).toContain('optionAt(event.clientX, event.clientY)')
    expect(up).toContain('isOverPill(event.clientX, event.clientY)')
    expect(source).toContain('document.elementFromPoint(x, y)')
    expect(source).toContain('setPointerCapture')
  })

  it('cancels the long-press timer before a released press is dropped, so a tap never opens the menu', () => {
    for (const [start, end] of [['const handlePointerUp = useCallback', 'const handlePointerCancel'], ['const handlePointerCancel = useCallback', 'const handleTouchEnd']]) {
      const handler = sourceBetween(start, end)
      expect(handler.indexOf('clearPressTimer()')).toBeGreaterThan(0)
      expect(handler.indexOf('clearPressTimer()')).toBeLessThan(handler.indexOf('pressRef.current = null'))
    }
  })

  it('closes on Escape via window capture, outside taps and Android back above the viewer', () => {
    expect(source).toContain("window.addEventListener('keydown', handleKeyDown, true)")
    expect(source).toContain("window.addEventListener('pointerdown', handlePointerDown, true)")
    expect(source).toContain('const MENU_BACK_PRIORITY = 50')
    expect(source).toContain('registerNativeBackHandler(() => { closeMenu(false); return true }, MENU_BACK_PRIORITY)')
  })

  it('opens the menu from the keyboard and renders it without a body portal', () => {
    const keys = sourceBetween('const handleKeyDown = useCallback', 'const handleMenuKeyDown')
    expect(keys).toContain("event.key === 'ContextMenu'")
    expect(keys).toContain("event.shiftKey && event.key === 'F10'")
    expect(keys).toContain("event.altKey && event.key === 'ArrowDown'")
    expect(source).not.toContain('createPortal')
  })
})
