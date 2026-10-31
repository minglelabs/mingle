import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The "out of Hash" sheet opened over a positive balance and stayed open: a
// refusal reported exhaustion and the sheet trusted it without asking the
// wallet. notifyCoinsExhausted now re-reads the wallet first.

function wallet(balance: number) {
  return {
    billingMode: 'enforce',
    balance,
    freeBalance: balance,
    paidBalance: 0,
    nextDailyGrantAt: new Date(Date.now() + 3_600_000).toISOString(),
    dailyFreeFull: false,
    dailyFreeCap: 0,
    lowBalance: balance < 200,
    exhausted: balance <= 0,
  }
}

async function loadClient(responses: Array<() => Promise<Response>>) {
  vi.resetModules()
  const target = new EventTarget()
  const events: string[] = []
  target.addEventListener('mingle:coin-ui', (event) => {
    events.push((event as CustomEvent<{ type: string }>).detail.type)
  })
  vi.stubGlobal('window', target)
  const fetchMock = vi.fn(() => {
    const next = responses.shift()
    if (!next) throw new Error('unexpected fetch')
    return next()
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = await import('./coin-wallet-client')
  return { client, events, fetchMock }
}

const ok = (balance: number) => () => Promise.resolve(new Response(JSON.stringify(wallet(balance)), { status: 200 }))
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('notifyCoinsExhausted', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not raise the sheet when a fresh wallet read still has coins', async () => {
    const { client, events } = await loadClient([ok(825), ok(825)])
    await client.refreshCoinWallet({ force: true })
    client.notifyCoinsExhausted()
    await flush()
    await flush()
    expect(events).toEqual([])
    expect(client.getCoinWalletState().wallet?.balance).toBe(825)
    expect(client.getCoinWalletState().wallet?.exhausted).toBe(false)
  })

  it('raises the sheet once the server confirms the balance is gone', async () => {
    const { client, events } = await loadClient([ok(5), ok(0)])
    await client.refreshCoinWallet({ force: true })
    client.notifyCoinsExhausted()
    await flush()
    await flush()
    expect(events).toEqual(['exhausted'])
    expect(client.getCoinWalletState().wallet?.exhausted).toBe(true)
  })

  it('trusts the refusal when the wallet cannot be re-read', async () => {
    const { client, events } = await loadClient([ok(40), () => Promise.reject(new Error('offline'))])
    await client.refreshCoinWallet({ force: true })
    client.notifyCoinsExhausted()
    await flush()
    await flush()
    expect(events).toEqual(['exhausted'])
    expect(client.getCoinWalletState().wallet?.balance).toBe(0)
  })

  it('stays quiet while billing is not enforced', async () => {
    const shadow = () => Promise.resolve(new Response(JSON.stringify({ ...wallet(0), billingMode: 'shadow' }), { status: 200 }))
    const { client, events } = await loadClient([shadow, shadow])
    await client.refreshCoinWallet({ force: true })
    client.notifyCoinsExhausted()
    await flush()
    await flush()
    expect(events).toEqual([])
  })
})
