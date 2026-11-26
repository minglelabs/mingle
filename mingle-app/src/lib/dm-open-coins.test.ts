import { describe, expect, it } from 'vitest'
import { readDmOpenCoins, readDmOpenRefundHours } from '@/server/dm-open-charge'
import { parseDmOpenAnswer } from './dm-open-coins'

describe('dm open coins', () => {
  it('reads the price and the wait, off when asked', () => {
    expect(readDmOpenCoins({})).toBe(500)
    expect(readDmOpenCoins({ DM_OPEN_COINS: '300' })).toBe(300)
    expect(readDmOpenCoins({ DM_OPEN_COINS: 'off' })).toBeNull()
    expect(readDmOpenCoins({ DM_OPEN_COINS: '0' })).toBeNull()
    expect(readDmOpenRefundHours({})).toBe(48)
    expect(readDmOpenRefundHours({ DM_OPEN_REFUND_HOURS: '24' })).toBe(24)
  })

  it('reads the server question, and nothing else', () => {
    expect(parseDmOpenAnswer(402, { error: 'dm_open_price', coins: 500, refundHours: 48, balance: 900 })).toEqual({ kind: 'price', coins: 500, refundHours: 48, balance: 900 })
    expect(parseDmOpenAnswer(402, { error: 'dm_open_coins_short', coins: 500, refundHours: 48, balance: 120 })?.kind).toBe('short')
    expect(parseDmOpenAnswer(402, { error: 'coins_insufficient' })).toBeNull()
    expect(parseDmOpenAnswer(429, { error: 'dm_open_price', coins: 500 })).toBeNull()
  })
})
