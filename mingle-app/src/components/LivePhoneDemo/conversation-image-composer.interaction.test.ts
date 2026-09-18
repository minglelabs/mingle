import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./ConversationImageComposer.tsx', import.meta.url), 'utf8')

function sourceBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)

  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('conversation image composer touch interaction', () => {
  it('uses the ordinary button click after dismissing the keyboard focus', () => {
    const clickSource = sourceBetween(
      'const handleAttachmentClick = useCallback',
      'const send = async () => {',
    )

    expect(clickSource).toContain('document.activeElement instanceof HTMLElement')
    expect(clickSource).toContain('document.activeElement.blur()')
    expect(clickSource).toContain('openAttachmentMenu(event.currentTarget)')
    expect(clickSource).toContain('handleAttachmentClick')
  })

  it('does not unconditionally suppress WebView touch clicks with a custom pointer lifecycle', () => {
    const triggerSource = sourceBetween(
      '<button type="button" data-qa="live-demo-attachment-open"',
      '<input ref={input}',
    )

    const pointerDownMatch = triggerSource.match(/onPointerDown=\{([^}]+)\}/)
    if (pointerDownMatch) {
      expect(pointerDownMatch[1]).toContain('diagEnabled')
    }
    const pointerUpMatch = triggerSource.match(/onPointerUp=\{([^}]+)\}/)
    if (pointerUpMatch) {
      expect(pointerUpMatch[1]).toContain('diagEnabled')
    }
    expect(triggerSource).toContain('aria-expanded={onCloseKeyboard ? open : undefined}')
  })

  it('activates diagnostic mode via long-press and preserves URL / window fallback', () => {
    expect(source).toContain('DIAG_LONG_PRESS_MS')
    expect(source).toContain('DIAG_EXPIRY_MS')
    expect(source).toContain('localStorage')
    expect(source).toContain('new URLSearchParams(window.location.search).has(\'diag\')')
    expect(source).toContain('__mingle_toggle_diag__')
    expect(source).toContain('diagSuppressClickRef')
    expect(source).toContain('SUPPRESS_CLICK')
  })

  it('cancels diagnostic long-press on movement or cancel events', () => {
    expect(source).toContain('DIAG_MOVE_CANCEL_PX')
    expect(source).toContain('handleTouchMove')

    const triggerSource = sourceBetween(
      '<button type="button" data-qa="live-demo-attachment-open"',
      '<input ref={input}',
    )
    // onPointerCancel must always trigger cancelLongPress, even if diag is disabled
    expect(triggerSource).toContain('onPointerCancel={() => { cancelLongPress()')
  })

  it('only enables diagnostic long-press in keyboard mode', () => {
    const longPressSource = sourceBetween(
      'const handleLongPressStart',
      'const handleTouchMove',
    )
    expect(longPressSource).toContain('if (!onCloseKeyboard) return')
  })

  it('measures menu position at three key intervals (immediate, rAF, 250ms settled)', () => {
    const menuMeasureSource = sourceBetween(
      'const diagMenuRef',
      '// ── End diagnostic hooks',
    )
    expect(menuMeasureSource).toContain('MR1:')
    expect(menuMeasureSource).toContain('MR2:')
    expect(menuMeasureSource).toContain('MR3:')
    expect(menuMeasureSource).toContain('requestAnimationFrame')
  })

  it('keeps the portaled attachment menu above the active conversation surface', () => {
    const menuSource = sourceBetween(
      '{open && !chosen && createPortal',
      'document.body)}',
    )

    expect(menuSource).toContain('z-[110]')
    expect(menuSource).toContain('z-[111]')
  })
})
