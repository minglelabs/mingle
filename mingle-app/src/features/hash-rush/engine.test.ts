import { afterEach, describe, expect, it } from 'vitest'
import { padKey, stickDir, swipeDir } from './engine/client/input.js'
import { LANGUAGES, lang, setLanguage, t } from './engine/client/i18n.js'
import { gameServer, roomUrl } from './engine/client/net.js'
import { readHashRushServer } from './config'

// input.js gives `was` a null default, so TypeScript would read that parameter as null only.
const stick = stickDir as (dx: number, dy: number, was?: { x: number, y: number } | null) => { x: number, y: number }

// The copied engine (engine/README.md) is maintained here now. These pin the
// rules hash-rush's docs/UIUX-ISSUES.md settled on, so a change to the copy
// that breaks one shows up.

describe('hash rush engine: loading', () => {
  it('loads every module the app uses without a page around it', async () => {
    // The app's server renders the room without a DOM, and the game loads in
    // the page later: nothing may reach for window or document on import.
    const modules = await Promise.all([
      import('./engine/sim/game.js'),
      import('./engine/sim/map.js'),
      import('./engine/client/render.js'),
      import('./engine/client/input.js'),
      import('./engine/client/predict.js'),
      import('./engine/client/assist.js'),
      import('./engine/client/audio.js'),
      import('./engine/client/music.js'),
      import('./engine/client/haptics.js'),
      import('./engine/client/looks.js'),
      import('./engine/client/deco.js'),
      import('./engine/client/net.js'),
      import('./engine/client/mvp.js'),
      import('./engine/client/cards.js'),
      import('./engine/ai/bot.js'),
    ])
    expect(modules.every((m) => Object.keys(m).length > 0)).toBe(true)
  })
})

describe('hash rush engine: swipes on the map (UIUX-ISSUES 10-14)', () => {
  it('needs a finger travel of 32px over at least 50ms; anything less is a tap', () => {
    expect(swipeDir(31, 0, 200)).toBeNull()
    expect(swipeDir(32, 0, 200)).toEqual({ x: 1, y: 0 })
    expect(swipeDir(80, 0, 49)).toBeNull()
  })

  it('points one of 16 ways round the clock, diagonals included', () => {
    const angles = new Set<number>()
    for (let deg = 0; deg < 360; deg += 3) {
      const a = (deg * Math.PI) / 180
      const dir = swipeDir(Math.cos(a) * 60, Math.sin(a) * 60, 100)!
      expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 2)
      const way = Math.round((((Math.atan2(dir.y, dir.x) * 180) / Math.PI + 360) % 360) / 22.5) % 16
      expect((((Math.atan2(dir.y, dir.x) * 180) / Math.PI + 360) % 360) - way * 22.5).toBeCloseTo(0, 0)
      angles.add(way)
    }
    expect(angles.size).toBe(16)
    expect(swipeDir(50, 50, 100)).toEqual({ x: 0.707, y: 0.707 })
  })
})

describe('hash rush engine: the doughnut pad (UIUX-ISSUES 10-13, 10-15)', () => {
  it('stops in the hole in the middle and runs flat out past it, 16 ways', () => {
    expect(stickDir(3, 4)).toEqual({ x: 0, y: 0 })
    expect(stickDir(0, -40)).toEqual({ x: 0, y: -1 })
    expect(stickDir(40, 40)).toEqual({ x: 0.707, y: 0.707 })
  })

  it('keeps its heading against a wobbling thumb', () => {
    const was = stick(40, 0)
    // About 14 degrees off: still the same way.
    expect(stick(40, 10, was)).toBe(was)
    // Well past it: a new way.
    expect(stick(40, 25, was)).not.toBe(was)
  })

  it('lights one key along a lane and both next to a diagonal', () => {
    expect([padKey(1), padKey(0.707), padKey(0.383), padKey(-0.707)]).toEqual([1, 1, 0, -1])
  })
})

describe('hash rush engine: strings follow the app language', () => {
  afterEach(() => setLanguage('en'))

  it('picks Korean, Japanese, Chinese by script, else English', () => {
    expect(setLanguage('ko-KR')).toBe('ko')
    expect(lang).toBe('ko')
    expect(t('bonk')).toBe('꿀밤')
    expect(setLanguage('ja')).toBe('ja')
    expect(setLanguage('zh-TW')).toBe('zh-Hant')
    expect(setLanguage('zh-CN')).toBe('zh-Hans')
    expect(setLanguage('fr-FR')).toBe('en')
    expect(t('bonk')).toBe('Bonk')
  })

  it('has every HUD string in every language', () => {
    const keys = ['bonk', 'throwBtn', 'go', 'bonkWord', 'lostSeed', 'superPlay', 'killNames', 'gotSeedMe', 'gotSeedMate', 'gotSeedOther', 'overtime', 'rush', 'alarmMe', 'alarmMate', 'alarmOther', 'portalNoSeed', 'tally', 'overtimeClock', 'spectating', 'watchThisRound', 'hint', 'hintTouch', 'meTag', 'victory', 'defeat', 'roundOver', 'winnerIs', 'winnersShared', 'teamNames', 'names']
    for (const code of LANGUAGES) {
      setLanguage(code)
      for (const key of keys) expect(t(key, 'x', 1), `${code}.${key}`).toBeDefined()
    }
  })

  // UIUX-ISSUES #13: no "undefined" on screen. The cards between rounds use these.
  it('has every string of the lobby, the score table, the result and the title in every language', () => {
    const keys = ['columns', 'colWins', 'colLosses', 'colScore', 'goalBadge', 'mvpRule', 'thisRound', 'totals', 'gameNo', 'firstTo', 'deuce', 'whyBonks', 'whyBonked', 'whySeeds', 'whyTie', 'champMe', 'champOther', 'champShared', 'champNote', 'sitIn', 'standUp', 'spectators', 'mapNames', 'modeSolo', 'modeTeam']
    for (const code of LANGUAGES) {
      setLanguage(code)
      for (const key of keys) {
        const value = t(key, 'x', 1)
        expect(value, `${code}.${key}`).toBeDefined()
        expect(String(value), `${code}.${key}`).not.toContain('undefined')
      }
      expect((t('columns') as string[]).length, `${code}.columns`).toBe(7)
      expect(Object.keys(t('mapNames') as Record<string, string>), `${code}.mapNames`).toContain('meadow')
    }
  })
})

describe('hash rush engine: the game server address', () => {
  it('takes ws and wss addresses only', () => {
    expect(gameServer('wss://hashrush-ws-dev.minglelabs.app')).toBe('wss://hashrush-ws-dev.minglelabs.app')
    expect(gameServer(' ws://127.0.0.1:8090 ')).toBe('ws://127.0.0.1:8090')
    expect(gameServer('https://minglelabs.app')).toBe('')
    expect(gameServer('wss://bad host')).toBe('')
    expect(readHashRushServer('wss://hashrush-ws-dev.minglelabs.app/')).toBe('wss://hashrush-ws-dev.minglelabs.app/')
    expect(readHashRushServer('http://x')).toBe('')
    expect(readHashRushServer(undefined)).toBe('')
  })

  it('joins /rooms/<room> with the entry ticket', () => {
    expect(roomUrl('wss://game.example/', 'mingle-abc', 'a.b+c')).toBe('wss://game.example/rooms/mingle-abc?ticket=a.b%2Bc')
    expect(roomUrl('ws://127.0.0.1:8090', 'mingle-abc')).toBe('ws://127.0.0.1:8090/rooms/mingle-abc')
  })
})
