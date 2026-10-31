import { describe, expect, it } from 'vitest'
import { resolveHashRushField } from './layout'

describe('hash rush field layout', () => {
  it('fills the width of a phone game area with the map turned, at the top', () => {
    // iPhone 11 Pro, under the room's thin top bar: 375 x 724 is left.
    expect(resolveHashRushField(375, 724)).toEqual({ tall: true, widthPx: 375, heightPx: 612, topPx: 0 })
  })

  it('keeps the whole map in a short tall area, as wide as the height allows', () => {
    const field = resolveHashRushField(360, 540)!
    expect(field.tall).toBe(true)
    expect(field.heightPx).toBeLessThanOrEqual(540)
    expect(field.widthPx).toBe(Math.floor((540 * 560) / 914))
  })

  it('shows the map the right way round on a wide area, centred', () => {
    const field = resolveHashRushField(1000, 700)!
    expect(field.tall).toBe(false)
    expect(field.widthPx).toBe(1000)
    expect(field.heightPx).toBe(Math.floor((1000 * 560) / 914))
    expect(field.topPx).toBe(Math.floor((700 - field.heightPx) / 2))
  })

  it('waits for an area that has a size', () => {
    expect(resolveHashRushField(0, 700)).toBeNull()
    expect(resolveHashRushField(400, Number.NaN)).toBeNull()
  })
})
