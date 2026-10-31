import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const layerSource = read('./HashRushRoomLayer.tsx')
const gameSource = read('./HashRushGame.tsx')
const clientSource = read('./client.ts')
const css = read('./hash-rush-game.module.css')
const liveDemoSource = read('../../components/LivePhoneDemo/LivePhoneDemo.tsx')
const globalCss = read('../../app/globals.css')

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

/** The body of the first CSS rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css)
  expect(match, selector).not.toBeNull()
  return match![1]
}

describe('hash rush native game wiring', () => {
  it('opens from the room menu, after closing the menu through its history', () => {
    const menuItem = between(liveDemoSource, 'data-qa="live-demo-hash-rush-menu-item"', '</button>')
    expect(menuItem).toContain('requestCloseMenuPanel()')
    expect(menuItem).not.toContain('setMenuOpen(false)')
    expect(menuItem).toContain('setHashRushGameActive(true)')
    expect(menuItem).toContain('setHashRushGameOpen(true)')
    expect(menuItem).toContain('{hashRushGameMenuLabel(uiLocale)}')
    expect(liveDemoSource).toContain('{conversationId && isHashRushGameConfigured() ? (')
  })

  it('covers the room as one layer, kept while lowered and dropped when the room is left', () => {
    const render = between(liveDemoSource, '{/* Hash Rush, played natively in this room', '{/* Header */}')
    expect(render).toContain('{hashRushGameActive && conversationId ? (')
    expect(render).toContain('<HashRushRoomLayer')
    expect(render).toContain('key={conversationId}')
    expect(render).toContain('open={hashRushGameOpen}')
    expect(render).toContain('voiceActive={voiceTalkState.connected}')
    expect(render).toContain('onClose={closeHashRushGame}')
    const leave = between(liveDemoSource, '// Leaving the room (back to the list', '}, [isVisible])')
    expect(leave).toContain('setHashRushGameOpen(false)')
    expect(leave).toContain('setHashRushGameActive(false)')
    expect(layerSource).toContain('absolute inset-0 z-[47] flex flex-col')
    expect(layerSource).toContain("transitionEnd: { visibility: 'hidden' }")
    expect(layerSource).toContain('inert={!open}')
    expect(layerSource).toContain('visible={open}')
  })

  it('has a thin top bar: back to the chat, the title and a green dot during a voice talk', () => {
    const bar = between(layerSource, 'className="shrink-0 border-b border-gray-100 bg-white"', '<HashRushGame')
    expect(bar).toContain("paddingTop: 'env(safe-area-inset-top, 0px)'")
    expect(bar).toContain('className="flex h-11 items-center')
    expect(bar).toContain('onClick={onClose}')
    expect(bar).toContain('aria-label={copy.backToChat}')
    expect(bar).toContain('{copy.title}')
    expect(bar).toContain('{voiceActive ? (')
    expect(bar).toContain('bg-emerald-500')
    // The game takes all the height left.
    expect(layerSource).toContain('<div className="relative min-h-0 flex-1">')
  })

  it('holds the swipe-back, Android back, the ad banner and toasts while up', () => {
    expect(layerSource).toContain('return registerNativeEdgeSwipeSuppression()')
    expect(layerSource).toContain('return registerNativeBackHandler(() => {')
    expect(layerSource).toContain('useNativeBannerSuppression(open)')
    expect(layerSource).toContain('return holdToastsHidden()')
    expect(layerSource).toContain("document.documentElement.dataset.hashRushOpen = 'true'")
    expect(globalCss).toContain('html[data-hash-rush-open="true"] [data-sonner-toaster]')
    expect(layerSource).toContain('onPointerDown={(event) => event.stopPropagation()}')
    expect(layerSource).toContain('onTouchStart={(event) => event.stopPropagation()}')
  })

  it('loads the game in the page only, and tears it down with the room', () => {
    expect(gameSource).toContain("import('./client')")
    // Only its types are imported up front; the code waits for the page.
    expect(gameSource).not.toMatch(/^import (?!type )[^\n]* from '\.\/client'$/m)
    expect(gameSource).toContain('client?.destroy()')
    expect(gameSource).toContain('clientRef.current?.setVisible(visible)')
    expect(gameSource).toContain('clientRef.current?.setVoice(voiceActive)')
    expect(clientSource).toContain('input.destroy()')
    expect(clientSource).toContain('audio.dispose()')
    expect(clientSource).toContain('listening.abort()')
  })

  it('goes quiet out of sight and stops this hamster, and leaves the audio session to the app', () => {
    const visibility = between(clientSource, 'setVisible(next) {', 'setVoice(active) {')
    expect(visibility).toContain('audio.setAway(!next)')
    expect(visibility).toContain('syncInput()')
    expect(visibility).toContain('standStill()')
    expect(clientSource).toContain('createAudio({ audioSession: false })')
  })

  it('speaks the page protocol: hello, numbered inputs on the fast lane, snapshots', () => {
    expect(clientSource).toContain('joined.send(helloMessage({ name: grant.name || options.playerName, pid }))')
    expect(clientSource).toContain('if (message && line) line.fast(message)')
    expect(clientSource).toContain('if (message) predictor.sent(at, message)')
    expect(clientSource).toContain('predictor.heard(now, snap.k, result.ack)')
    expect(clientSource).toContain('{ ticket: grant.ticket }')
  })

  it('keeps the UIUX-ISSUES control and layout rules', () => {
    // The doughnut pad in its corner, the bonk button in the other, the throw button over it.
    expect(rule('.pad')).toContain('width: 148px;')
    expect(rule('.pad')).toContain('bottom: max(2px, env(safe-area-inset-bottom));')
    expect(rule('.tall .bonk')).toContain('width: 100px;')
    expect(rule('.throw')).toContain('bottom: calc(max(22px, env(safe-area-inset-bottom)) + clamp(84px, 20vmin, 128px) + 12px);')
    // Plain to see over any map; half faded only while a hamster is under it on a phone (#216, #223).
    expect(rule('.pad path')).toContain('fill: rgba(255, 255, 255, 0.32);')
    expect(between(css, '@media (pointer: coarse) {', '/* The round')).toContain('filter: opacity(0.5);')
    expect(clientSource).toContain('node.classList.toggle(classes.under, under)')
    expect(gameSource).toContain('elements.overMap = [elements.pad, elements.bonk, elements.throwButton, toolsMore]')
    // Every touch is the game's.
    expect(rule('.stage')).toContain('touch-action: none;')
    expect(rule('.stage')).toContain('-webkit-touch-callout: none;')
    expect(rule('.stage')).toContain('user-select: none;')
    // The swipe and the pad themselves are the engine's (engine.test.ts pins their rules).
    expect(clientSource).toContain('createInput({')
  })
})
