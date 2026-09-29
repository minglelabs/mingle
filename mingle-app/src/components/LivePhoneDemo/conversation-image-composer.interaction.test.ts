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
  it('keeps keyboard focus while retaining click and pointer activation', () => {
    const clickSource = sourceBetween(
      'const handleAttachmentClick = useCallback',
      'const send = async () => {',
    )

    expect(clickSource).toContain('openAttachmentMenu(event.currentTarget)')
    expect(source).toContain('handleAttachmentPointerUp')
    expect(source).toContain('event.preventDefault()')
  })

  it('preserves keyboard focus while handling the WebView pointer lifecycle', () => {
    const triggerSource = sourceBetween(
      '<button type="button" data-qa="live-demo-attachment-open"',
      '<input ref={input}',
    )

    const pointerDownMatch = triggerSource.match(/onPointerDown=\{([^}]+)\}/)
    if (pointerDownMatch) {
      expect(pointerDownMatch[1]).toContain('handleAttachmentPointerDown')
    }
    const pointerUpMatch = triggerSource.match(/onPointerUp=\{([^}]+)\}/)
    if (pointerUpMatch) {
      expect(pointerUpMatch[1]).toContain('handleAttachmentPointerUp')
    }
    expect(triggerSource).toContain('aria-expanded={onCloseKeyboard ? open : undefined}')
    expect(source).toContain('if (onCloseKeyboard) event.preventDefault()')
    expect(source).toContain('openAttachmentMenu(event.currentTarget)')
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
    expect(triggerSource).toContain('onPointerCancel')
    expect(triggerSource).toContain('cancelLongPress()')
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
      'const attachmentMenuRef',
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
      'document.body,',
    )

    expect(menuSource).toContain('zIndex: 9999')
    expect(menuSource).toContain('rounded-2xl border border-[#e5e7eb] bg-white')
    expect(menuSource).toContain('shadow-[0_8px_32px_rgba(15,23,42,0.13),0_2px_10px_rgba(15,23,42,0.07)]')
  })

  it('keeps the keyboard open while offering the voice-mode switch', () => {
    expect(source).not.toContain('document.activeElement.blur()')
    expect(source).toContain('copy.switchToVoiceMode')
  })

  it('keeps the textarea focused when the keyboard-mode photo item is tapped', () => {
    const menuSource = sourceBetween(
      '{open && !chosen && createPortal',
      'document.body,',
    )
    const chooseItem = menuSource.slice(0, menuSource.indexOf('copy.switchToVoiceMode'))

    expect(chooseItem).toContain('onPointerDown={event => { if (onCloseKeyboard) event.preventDefault() }}')
    expect(chooseItem).toContain('openFilePicker()')
    expect(chooseItem).not.toContain('input.current?.click()')
  })

  it('restores keyboard focus after the chooser is cancelled or the preview closes', () => {
    const pickerSource = sourceBetween(
      'const openFilePicker = useCallback',
      'const handleAttachmentClick = useCallback',
    )
    // Only keyboard mode captures a restore target; voice mode stores none.
    expect(pickerSource).toMatch(
      /pickerFocusRestoreRef\.current = onCloseKeyboard\s*\?\s*captureRestorableFocus\(document\) \?\? menuFocusOwnerRef\.current\s*:\s*null/,
    )
    expect(pickerSource).toContain("node.addEventListener('cancel', restorePickerFocus)")
    expect(pickerSource).toContain('scheduleFocusRestore(element')

    const inputSource = sourceBetween('<input ref={input}', '{open && !chosen && createPortal')
    expect(inputSource).toContain('if (!file) { restorePickerFocus(); return }')
    expect(source).toContain('onClose={closePreview}')
    expect(source).toContain('onSent(); restorePickerFocus()')
  })

  it('defers the invalid-file focus restore until the error menu closes', () => {
    const inputSource = sourceBetween('<input ref={input}', '{open && !chosen && createPortal')
    const invalidBranch = inputSource.slice(inputSource.indexOf('setError(copy.invalid)'))
    const invalidBranchEnd = invalidBranch.slice(0, invalidBranch.indexOf('return }'))
    expect(invalidBranchEnd).toContain('errorMenuFocusRestorePendingRef.current = true')
    expect(invalidBranchEnd).not.toContain('restorePickerFocus()')

    const deferredSource = sourceBetween(
      'const restorePickerFocus = useCallback',
      "node.addEventListener('cancel', restorePickerFocus)",
    )
    expect(deferredSource).toContain('if (open || !errorMenuFocusRestorePendingRef.current) return')
    expect(deferredSource).toContain('}, [open, restorePickerFocus])')

    // A new chooser flow (e.g. a valid re-pick whose preview restores on close) clears it.
    const pickerSource = sourceBetween(
      'const openFilePicker = useCallback',
      'const restorePickerFocus = useCallback',
    )
    expect(pickerSource).toContain('errorMenuFocusRestorePendingRef.current = false')
  })

  it('reports attachment overlay state so native banners can stay behind overlays', () => {
    expect(source).toContain('onMenuOpenChange?: (open: boolean) => void')
    expect(source).toContain('onMenuOpenChange?.(open)')
    expect(source).toContain('onMenuOpenChange?.(false)')
  })
})
