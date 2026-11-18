import { describe, expect, it } from 'vitest'
import { resolveHashRushField } from './layout'

describe('hash rush field layout', () => {
  it('fills the width of a tall area with the map turned, at the top', () => {
    expect(resolveHashRushField(375, 724)).toEqual({ tall: true, widthPx: 375, heightPx: 612, topPx: 0 })
  })

  it('fits the map above the strip of touch controls on an iPhone 11 Pro', () => {
    // 812 high: 44 of status bar, then the arena, then 148 + 34 + 4 of controls.
    const field = resolveHashRushField(375, 812 - 44 - (148 + 34 + 4), true)!
    expect(field).toEqual({ tall: true, widthPx: 356, heightPx: 581, topPx: 0 })
    // Nearly the whole width still: 95%.
    expect(field.widthPx / 375).toBeGreaterThan(0.94)
  })

  it('keeps the whole map in a short tall area, as wide as the height allows', () => {
    const field = resolveHashRushField(360, 540)!
    expect(field.tall).toBe(true)
    expect(field.heightPx).toBeLessThanOrEqual(540)
    expect(field.widthPx).toBe(Math.floor((540 * 560) / 914))
  })

  it("turns the map with the screen's shape, not the arena's", () => {
    // A tall screen whose arena came out squat still shows the map turned, smaller.
    const field = resolveHashRushField(400, 300, true)!
    expect(field.tall).toBe(true)
    expect(field.heightPx).toBeLessThanOrEqual(300)
    expect(field.topPx).toBe(0)
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
