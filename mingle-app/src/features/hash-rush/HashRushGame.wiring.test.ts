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
    expect(layerSource).toContain('absolute inset-0 z-[47] overflow-hidden')
    expect(layerSource).toContain("transitionEnd: { visibility: 'hidden' }")
    expect(layerSource).toContain('inert={!open}')
    expect(layerSource).toContain('visible={open}')
  })

  it('has no app bar: the game takes the whole screen, with a back pill over the map (device check 3)', () => {
    expect(layerSource).not.toContain('data-qa="hash-rush-game-bar"')
    expect(layerSource).not.toContain('h-11')
    expect(layerSource).toContain('onBack={onClose}')
    const pill = between(gameSource, 'ref={backRef}', '</button>')
    expect(pill).toContain('onClick={onBack}')
    expect(pill).toContain('aria-label={copy.backToChat}')
    expect(pill).toContain('<ChevronLeft')
    expect(pill).toContain('{copy.backShort}')
    expect(pill).toContain('{voiceActive ? (')
    expect(pill).toContain('className={styles.voiceDot}')
    // Over the map's top left corner, under the status bar: the arena starts below the safe area.
    expect(rule('.back')).toContain('top: 1.2cqw;')
    expect(rule('.back')).toContain('left: 1.4cqw;')
    expect(rule('.tall .arena')).toContain('top: env(safe-area-inset-top, 0px);')
    // Behind the status bar a pale strip, so its dark text still reads.
    expect(rule('.tall::before')).toContain('height: env(safe-area-inset-top, 0px);')
  })

  it('lays the map out above the strip of touch controls, never under them (device check 1)', () => {
    const touch = between(css, '@media (pointer: coarse) {', '.pad {\n    display: grid;')
    expect(touch).toContain('bottom: calc(148px + var(--hr-foot) + 4px);')
    expect(rule('.stage')).toContain('--hr-foot: max(6px, env(safe-area-inset-bottom, 0px));')
    expect(rule('.pad')).toContain('bottom: var(--hr-foot);')
    expect(rule('.tall .bonk')).toContain('bottom: var(--hr-foot);')
    expect(rule('.tall .throw')).toContain('bottom: calc(var(--hr-foot) + 108px);')
    // The map is measured in the arena; its shape (turned or not) is the screen's.
    expect(gameSource).toContain('resolveHashRushField(arena.clientWidth, arena.clientHeight, shapeTall)')
    // The round's own buttons sit in the gap between the pad's and the bonk button's hit areas.
    expect(touch).toContain('left: calc(50% + 15px);')
    expect(touch).toContain('left: calc(50% - 15px);')
  })

  it('shows the round news as a small strip on the map top edge, off the sunflower (device check 2)', () => {
    const banner = rule('.tall .banner')
    expect(banner).toContain('top: 1.2cqw;')
    expect(banner).toContain('font-size: 12.5px;')
    expect(banner).toContain('max-width: calc(100% - 200px);')
    expect(banner).toContain('background: rgba(58, 42, 26, 0.3);')
    expect(banner).toContain('white-space: normal;')
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
    expect(rule('.tall .bonk')).toContain('width: 100px;')
    expect(rule('.throw')).toContain('bottom: calc(max(22px, env(safe-area-inset-bottom)) + clamp(84px, 20vmin, 128px) + 12px);')
    // Plain to see over any map; half faded only while a hamster is under it on a phone (#216, #223).
    expect(rule('.pad path')).toContain('fill: rgba(255, 255, 255, 0.32);')
    expect(between(css, '.pad {\n    display: grid;', '/* Once the round')).toContain('filter: opacity(0.5);')
    expect(clientSource).toContain('node.classList.toggle(classes.under, under)')
    // The back pill lies over the map too, and fades the same way.
    expect(gameSource).toContain('elements.overMap = [elements.pad, elements.bonk, elements.throwButton, toolsMore, back]')
    // Every touch is the game's.
    expect(rule('.stage')).toContain('touch-action: none;')
    expect(rule('.stage')).toContain('-webkit-touch-callout: none;')
    expect(rule('.stage')).toContain('user-select: none;')
    // The swipe and the pad themselves are the engine's (engine.test.ts pins their rules).
    expect(clientSource).toContain('createInput({')
  })
})
