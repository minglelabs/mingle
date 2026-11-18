import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HASH_RUSH_TICKET_REUSE_MARGIN_MS,
  isHashRushTicketGrantReusable,
  parseHashRushTicketGrant,
  requestHashRushTicket,
} from './ticket'

describe('hash rush entry tickets', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the ticket answer and counts its life from when it arrived', () => {
    expect(parseHashRushTicketGrant({ ticket: 't', room: 'mingle-a', name: 'Mia', expiresIn: 7200 }, 1000)).toEqual({
      ticket: 't',
      room: 'mingle-a',
      name: 'Mia',
      expiresAtMs: 1000 + 7_200_000,
    })
    expect(parseHashRushTicketGrant({ ticket: 't', room: 'mingle-a' }, 1000)?.expiresAtMs).toBe(1000)
    expect(parseHashRushTicketGrant({ ticket: '', room: 'mingle-a' }, 1000)).toBeNull()
    expect(parseHashRushTicketGrant({ ticket: 't' }, 1000)).toBeNull()
    expect(parseHashRushTicketGrant([], 1000)).toBeNull()
  })

  it('reuses a ticket until shortly before it runs out', () => {
    const grant = { ticket: 't', room: 'r', name: '', expiresAtMs: 100_000_000 }
    expect(isHashRushTicketGrantReusable(grant, grant.expiresAtMs - HASH_RUSH_TICKET_REUSE_MARGIN_MS - 1)).toBe(true)
    expect(isHashRushTicketGrantReusable(grant, grant.expiresAtMs - HASH_RUSH_TICKET_REUSE_MARGIN_MS)).toBe(false)
    expect(isHashRushTicketGrantReusable(null, 0)).toBe(false)
  })

  it('asks the room ticket API once and reuses the answer, unless a fresh one is wanted', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ticket: 'tk', room: 'mingle-c1', name: 'Mia', expiresIn: 7200 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const first = await requestHashRushTicket({ conversationId: 'c1', viewerKey: 'viewer-reuse' })
    const again = await requestHashRushTicket({ conversationId: 'c1', viewerKey: 'viewer-reuse' })
    expect(again).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]).toEqual([
      expect.stringMatching(/\/api\/(?:[a-z]+\/v[\d.]+\/)?conversations\/c1\/hash-rush\/ticket$/),
      { method: 'POST', credentials: 'include' },
    ])
    await requestHashRushTicket({ conversationId: 'c1', viewerKey: 'viewer-reuse', fresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails when the app server says no', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })))
    await expect(requestHashRushTicket({ conversationId: 'c2', viewerKey: 'viewer-no' })).rejects.toThrow('hash_rush_ticket_403')
  })
})
