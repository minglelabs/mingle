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
  it('opens the keyboard-composer attachment menu on pointer-up after preserving textarea focus', () => {
    const pointerDownSource = sourceBetween(
      'const handleAttachmentPointerDown = useCallback',
      'const handleAttachmentPointerUp = useCallback',
    )
    const pointerUpSource = sourceBetween(
      'const handleAttachmentPointerUp = useCallback',
      'const handleAttachmentClick = useCallback',
    )
    const triggerSource = sourceBetween(
      '<button type="button" data-qa="live-demo-attachment-open"',
      '<input ref={input}',
    )

    expect(pointerDownSource).toContain('event.preventDefault()')
    expect(pointerUpSource).toContain('toggleAttachmentMenu(event.currentTarget)')
    expect(triggerSource).toContain('onPointerDown={handleAttachmentPointerDown}')
    expect(triggerSource).toContain('onPointerUp={handleAttachmentPointerUp}')
  })

  it('does not double-toggle after a pointer click and keeps click-only activation available', () => {
    const clickSource = sourceBetween(
      'const handleAttachmentClick = useCallback',
      'const send = async () => {',
    )
    const triggerSource = sourceBetween(
      '<button type="button" data-qa="live-demo-attachment-open"',
      '<input ref={input}',
    )

    expect(clickSource).toContain('event.detail > 0 && pointerClickSuppressionRef.current')
    expect(clickSource).toContain('toggleAttachmentMenu(event.currentTarget)')
    expect(triggerSource).toContain('onClick={handleAttachmentClick}')
    expect(triggerSource).toContain('aria-expanded={onCloseKeyboard ? open : undefined}')
  })
})
