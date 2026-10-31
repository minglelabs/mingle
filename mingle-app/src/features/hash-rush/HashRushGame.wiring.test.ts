import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const layerSource = read('./HashRushRoomLayer.tsx')
const gameSource = read('./HashRushGame.tsx')
const clientSource = read('./client.ts')
const css = read('./hash-rush-game.module.css')
const liveDemoSource = read('../../components/LivePhoneDemo/LivePhoneDemo.tsx')
const globalCss = read('../../app/globals.css')
const cardsSource = read('./HashRushCards.tsx')
const cardsCss = read('./hash-rush-cards.module.css')

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
    expect(rule('.back')).toContain('top: calc(var(--hr-field-y, env(safe-area-inset-top, 0px)) + 5px);')
    expect(rule('.back')).toContain('left: calc(var(--hr-field-x, 0px) + 6px);')
    expect(rule('.tall .arena')).toContain('top: env(safe-area-inset-top, 0px);')
    // ...and over every card: the way out is always in the same place.
    expect(rule('.back')).toContain('z-index: 5;')
    expect(gameSource.indexOf('ref={backRef}')).toBeGreaterThan(gameSource.indexOf('<HashRushTitleCard'))
    expect(gameSource.indexOf('ref={backRef}')).toBeGreaterThan(gameSource.indexOf('<HashRushLobbyCard'))
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
    // The back pill and the score button lie over the map too (on a wide screen), and fade the same way.
    expect(gameSource).toContain('elements.overMap = [elements.pad, elements.bonk, elements.throwButton, toolsMore, back, scoreButton]')
    // Every touch is the game's.
    expect(rule('.stage')).toContain('touch-action: none;')
    expect(rule('.stage')).toContain('-webkit-touch-callout: none;')
    expect(rule('.stage')).toContain('user-select: none;')
    // The swipe and the pad themselves are the engine's (engine.test.ts pins their rules).
    expect(clientSource).toContain('createInput({')
  })
})

/** The body of the first rule in the cards stylesheet whose selector list is exactly `selector`. */
function cardRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(cardsCss)
  expect(match, selector).not.toBeNull()
  return match![1]
}

describe('hash rush between rounds (stage 2)', () => {
  it('shows a card for each moment between rounds, the controls away under a result', () => {
    expect(gameSource).toContain("{view.kind === 'lobby' ? <HashRushLobbyCard")
    expect(gameSource).toContain("{view.kind === 'result' && cardUp ? (")
    expect(gameSource).toContain("{view.kind === 'title' && cardUp ? (")
    expect(gameSource).toContain("{view.kind === 'connecting' || view.kind === 'failed' ? <HashRushGameCover")
    expect(gameSource).toContain('cardUp && styles.resultUp')
    // The cards are the component's; the game's code (and its engine) still waits for the page.
    expect(cardsSource).not.toMatch(/from '\.\/engine/)
    expect(cardsSource).not.toMatch(/^import (?!type )[^\n]* from '\.\/(client|score)'$/m)
    // Under the status bar, whose strip stays pale.
    expect(cardRule('.cover')).toContain('top: env(safe-area-inset-top, 0px);')
  })

  it('lets the result be put away and brought back, never by a tap meant for something else (#42, #144, #147)', () => {
    expect(cardsSource).toContain('export const HASH_RUSH_CARD_TAP_GUARD_MS = 700')
    expect(cardsSource).toContain('if (performance.now() - at < HASH_RUSH_CARD_TAP_GUARD_MS) return')
    // A tap on the dimmed map around the card puts it away too.
    expect(cardsSource).toContain('if (event.target === event.currentTarget) close()')
    // The 🏆 button brings it back; the countdown waits by the clock meanwhile.
    expect(gameSource).toContain("setHiddenCard((hidden) => (hidden === key ? '' : key))")
    expect(gameSource).toContain('{cardHidden && nextSeconds != null ? (')
    // The close button is big (#142).
    expect(cardRule('.close')).toContain('width: 46px;')
    expect(cardRule('.close')).toContain('height: 46px;')
  })

  it('keeps the score table rules: totals first, two tabs on a phone, the table scrolling inside its card (#104, #182, #225)', () => {
    expect(gameSource).toContain("useState<HashRushScoreView>('total')")
    // The title is won on the totals.
    expect(between(cardsSource, 'export function HashRushTitleCard', 'return (')).toContain("useState<HashRushScoreView>('total')")
    expect(cardRule('.tableWrap')).toContain('overflow-x: auto;')
    expect(cardRule('td.wins')).toContain('font-size: 1.4em;')
    // The tabs and the MVP rule stay inside the card; only the table scrolls.
    const table = between(cardsSource, 'export function HashRushScoreTable', 'function ScoreRows')
    expect(table.indexOf('styles.tabs')).toBeLessThan(table.indexOf('styles.tableWrap'))
    expect(table.indexOf('styles.tableWrap')).toBeLessThan(table.indexOf('styles.ruleLine'))
    // Over a round it is see-through, and a touch anywhere off it puts it away.
    expect(cardRule('.boardCard')).toContain('background: rgba(255, 248, 230, 0.38);')
    expect(cardRule('.boardLayer')).toContain('pointer-events: none;')
    expect(gameSource).toContain("window.addEventListener('pointerdown', away, true)")
    // Tab held with a keyboard (#39, #46).
    expect(gameSource).toContain("if (event.code !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || typing()) return")
  })

  it('has its own score button in the strip, only while there is a round to score', () => {
    const button = between(gameSource, 'ref={scoreButtonRef}', '</button>')
    expect(button).toContain('hidden={!inGame}')
    expect(button).toContain('onClick={onScoreButton}')
    expect(button).toContain('aria-label={copy.scoreboard}')
    expect(css).toContain('.scoreButton[hidden] {')
  })

  it('words the room as the server runs it: no host, rounds start by themselves', () => {
    // None of the page's host words: waiting for the host, asking the host, the host's rematch.
    for (const source of [clientSource, cardsSource, gameSource]) {
      expect(source).not.toMatch(/waitingHost|waitingRematch|askAgain|askedAgain|hostWatch|'again'/)
    }
    expect(cardsSource).toContain('copy.nextRoundIn(seconds)')
    expect(cardsSource).toContain('copy.startsIn(seconds)')
    expect(cardsSource).toContain('copy.autoStart')
  })

  it('lets a player watch and a watcher join, and stops seating somebody who chose to watch', () => {
    expect(clientSource).toContain('if (shouldTakeSeat(next, watchWanted) && performance.now() - sitAskedAt > SIT_EVERY_MS) {')
    const stand = between(clientSource, 'stand() {', 'scoreboard() {')
    expect(stand).toContain("if (destroyed || !line || (game && game.phase !== 'over')) return")
    expect(stand).toContain('watchWanted = true')
    expect(stand).toContain('line.send(STAND_MESSAGE)')
    const sit = between(clientSource, '    sit() {', 'stand() {')
    expect(sit).toContain('watchWanted = false')
    expect(sit).toContain('line.send(SIT_MESSAGE)')
    // Watching a round: no controls; what it means and the way in sit in their strip.
    expect(css).toContain('.watcher .pad,')
    expect(css).toContain('.tall .watchStrip {')
    expect(gameSource).toContain("{view.kind === 'round' && view.watcher && view.canSit ? (")
  })

  it("takes the server's record and its word on a finished round", () => {
    const over = between(clientSource, "} else if (type === 'over') {", "} else if (type === 'lobbyscreen') {")
    expect(over).toContain('if (!over || !game || over.round !== session.round) return')
    expect(over).toContain('counted = true')
    expect(over).toContain('champ = over.champ')
    expect(over).toContain("if (card !== 'none') showResult(game)")
    // The title card plays the page's fanfare once.
    const result = between(clientSource, 'function showResult(round: HashRushRound) {', 'function countRound')
    expect(result).toContain('audio.play.fanfare()')
    expect(result).toContain('audio.play.cheer()')
  })
})
