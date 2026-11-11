import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { CoinGiftError, quoteCoinGift, sendCoinGift } from './gifts'

const COIN = 1_000_000n

describe('quoteCoinGift', () => {
  it('keeps a 10% fee and delivers the rest', () => {
    expect(quoteCoinGift(100n * COIN)).toEqual({ feeMicro: 10n * COIN, receivedMicro: 90n * COIN })
    expect(quoteCoinGift(1n * COIN)).toEqual({ feeMicro: 100_000n, receivedMicro: 900_000n })
  })

  it('rounds the fee up, so fee + received is always the amount', () => {
    expect(quoteCoinGift(15n)).toEqual({ feeMicro: 2n, receivedMicro: 13n })
    expect(quoteCoinGift(0n)).toEqual({ feeMicro: 0n, receivedMicro: 0n })
  })
})

describe('sendCoinGift input checks', () => {
  const gift = (coins: number, recipientId = 'b') => sendCoinGift({ senderId: 'a', recipientId, coins, idempotencyKey: 'k' })

  it.each([0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses an amount of %s', async (coins) => {
    await expect(gift(coins)).rejects.toMatchObject({ code: 'gift_invalid_amount' })
  })

  it('refuses a gift to oneself', async () => {
    await expect(gift(10, 'a')).rejects.toBeInstanceOf(CoinGiftError)
    await expect(gift(10, 'a')).rejects.toMatchObject({ code: 'gift_self' })
  })
})
