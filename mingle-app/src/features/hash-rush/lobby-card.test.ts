import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HashRushLobbyCard } from './HashRushCards'
import { hashRushGameCopy } from './copy'
import type { HashRushLobbyHosting, HashRushLobbyView } from './client'

const hosting = (amHost: boolean, fill: number): HashRushLobbyHosting => ({
  amHost,
  hostName: 'Mia',
  teams: false,
  map: 'meadow',
  maps: [{ id: 'meadow', label: 'Meadow' }, { id: 'beach', label: 'Beach' }],
  botLevel: 'hard',
  botLevels: [{ id: 'easy', label: 'Easy' }, { id: 'hard', label: 'Hard' }],
  fill,
  fillMin: 2,
  fillMax: 8,
  teamChoices: [],
  myTeam: -1,
  notice: '',
  words: { start: 'Start', waitingHost: 'Waiting', solo: 'Solo', team: 'Team', map: 'Map' },
})

const view = (h: HashRushLobbyHosting): HashRushLobbyView => ({
  kind: 'lobby',
  mode: 'Meadow',
  seats: [{ seat: 0, name: 'Mia', team: -1, color: '#f00', me: h.amHost, winsText: '', fresh: false, host: true }],
  open: 7,
  bots: Math.max(0, h.fill - 1),
  spectators: '',
  you: h.amHost ? 0 : -1,
  chose: false,
  canSit: true,
  canStand: false,
  nextAt: 0,
  race: '',
  deuce: false,
  lastTitle: '',
  words: { sitIn: 'Sit in', standUp: 'Stand up', me: 'Me', spectating: 'Watching' },
  hosting: h,
})

const render = (h: HashRushLobbyHosting) => renderToStaticMarkup(createElement(HashRushLobbyCard, {
  view: view(h), copy: hashRushGameCopy('ko'), art: null, onSit: () => {}, onStand: () => {}, onSetup: () => {}, onGo: () => {},
}))

describe('hosted lobby', () => {
  it('lists every seat: the people, the computers put in, then each open seat with "+ computer" for the host', () => {
    const html = render(hosting(true, 3))
    expect(html.split('data-qa="hash-rush-seat-bot"').length - 1).toBe(2)
    expect(html.split('data-qa="hash-rush-seat-open"').length - 1).toBe(5)
    expect(html.split('data-qa="hash-rush-add-bot"').length - 1).toBe(5)
    expect(html).toContain('data-qa="hash-rush-start"')
    expect(html).not.toContain('data-qa="hash-rush-setup-fill"')
  })

  it('shows the settings to everyone else too, locked, with no start and no seat buttons', () => {
    const html = render(hosting(false, 3))
    expect(html).toContain('data-qa="hash-rush-host-setup"')
    expect(html).toContain('data-qa="hash-rush-host-only"')
    expect(html).not.toContain('data-qa="hash-rush-start"')
    expect(html).not.toContain('data-qa="hash-rush-add-bot"')
    expect(html).toMatch(/data-qa="hash-rush-setup-solo"[^>]*disabled|disabled=""[^>]*data-qa="hash-rush-setup-solo"/)
  })
})
