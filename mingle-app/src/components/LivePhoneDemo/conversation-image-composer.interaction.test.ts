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
    const triggerSource = sourceBetween(
      '<button type="button" data-qa="live-demo-attachment-open"',
      '<input ref={input}',
    )

    expect(clickSource).toContain('document.activeElement instanceof HTMLElement')
    expect(clickSource).toContain('document.activeElement.blur()')
    expect(clickSource).toContain('openAttachmentMenu(event.currentTarget)')
    expect(triggerSource).toContain('onClick={handleAttachmentClick}')
  })

  it('does not suppress WebView touch clicks with a custom pointer lifecycle', () => {
    const triggerSource = sourceBetween(
      '<button type="button" data-qa="live-demo-attachment-open"',
      '<input ref={input}',
    )

    expect(triggerSource).not.toContain('onPointerDown=')
    expect(triggerSource).not.toContain('onPointerUp=')
    expect(triggerSource).toContain('aria-expanded={onCloseKeyboard ? open : undefined}')
  })
})
