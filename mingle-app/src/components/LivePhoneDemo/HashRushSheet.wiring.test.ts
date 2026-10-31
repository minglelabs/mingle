import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sheetSource = readFileSync(new URL('./HashRushSheet.tsx', import.meta.url), 'utf8')
const liveDemoSource = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')
const voicePanelSource = readFileSync(new URL('./VoiceTalkPanel.tsx', import.meta.url), 'utf8')
const globalCss = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('hash rush sheet wiring', () => {
  it('covers the room from the status bar down, above every room layer', () => {
    expect(sheetSource).toContain("style={{ top: 'env(safe-area-inset-top, 0px)' }}")
    expect(sheetSource).toContain('absolute inset-x-0 bottom-0 z-[90]')
  })

  it('drags only from its top row and keeps the room swipe off the sheet', () => {
    expect(sheetSource).toContain('dragListener={false}')
    expect(sheetSource).toContain('onPointerDown={(event) => dragControls.start(event)}')
    expect(sheetSource).toContain('onPointerDown={(event) => event.stopPropagation()}')
    expect(sheetSource).toContain('onTouchStart={(event) => event.stopPropagation()}')
  })

  it('holds the swipe-back, Android back, banner and toasts while up', () => {
    expect(sheetSource).toContain('return registerNativeEdgeSwipeSuppression()')
    expect(sheetSource).toContain('return registerNativeBackHandler(() => {')
    expect(sheetSource).toContain('useNativeBannerSuppression(open)')
    expect(sheetSource).toContain('return holdToastsHidden()')
    expect(globalCss).toContain('html[data-hash-rush-open="true"] [data-sonner-toaster]')
  })

  it('posts to the game window on its origin and allows autoplay', () => {
    expect(sheetSource).toContain('target.postMessage(message, GAME_ORIGIN)')
    expect(sheetSource).toContain('allow="autoplay; fullscreen"')
    expect(sheetSource).toContain('onLoad={syncGame}')
  })

  it('keeps the game alive while lowered and drops it when the room is left', () => {
    const render = between(liveDemoSource, '{/* Hash Rush, played inside this room', '{/* Header */}')
    expect(render).toContain('{hashRushActive && conversationId ? (')
    expect(render).toContain('open={hashRushOpen}')
    expect(render).toContain('voiceActive={voiceTalkState.connected}')
    const leave = between(liveDemoSource, '// Leaving the room (back to the list', '}, [isVisible])')
    expect(leave).toContain('setHashRushOpen(false)')
    expect(leave).toContain('setHashRushActive(false)')
  })

  it('opens from the menu after closing the menu through its history', () => {
    const menuItem = between(liveDemoSource, 'data-qa="live-demo-hash-rush-menu-item"', '</button>')
    expect(menuItem).toContain('requestCloseMenuPanel()')
    expect(menuItem).not.toContain('setMenuOpen(false)')
    expect(menuItem).toContain('setHashRushActive(true)')
  })

  it('keeps the chat composer out of the game keyboard and folds the voice talk panel', () => {
    expect(liveDemoSource).toContain('const activeKeyboardInsetPx = isComposerOpen && !hashRushOpen ? keyboardViewportInsetPx : 0')
    expect(liveDemoSource).toContain('forceFolded={hashRushOpen}')
    expect(voicePanelSource).toContain('if (forceFolded) setFolded(true)')
    expect(voicePanelSource).toContain("const connected = phase === 'connected'")
  })
})
