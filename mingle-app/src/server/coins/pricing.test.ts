import { describe, expect, it } from 'vitest'
import { quoteCoinUsage, selectCoinPricingRate, type CoinPricingRateRow } from './pricing'

const AT = new Date('2026-10-03T00:00:00Z')

function rate(partial: Partial<CoinPricingRateRow> & Pick<CoinPricingRateRow, 'id' | 'kind' | 'unit' | 'usdMicroPerMillionUnits'>): CoinPricingRateRow {
  return { model: '*', marginBps: 15_000, effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null, ...partial }
}

const RATES: CoinPricingRateRow[] = [
  rate({ id: 'stt', kind: 'stt', unit: 'second', usdMicroPerMillionUnits: 33_333_333n }),
  rate({ id: 'tr-in', kind: 'translation', unit: 'input_token', model: 'gpt-6-luna', usdMicroPerMillionUnits: 100_000n }),
  rate({ id: 'tr-out', kind: 'translation', unit: 'output_token', model: 'gpt-6-luna', usdMicroPerMillionUnits: 500_000n }),
  rate({ id: 'tr-any-in', kind: 'translation', unit: 'input_token', usdMicroPerMillionUnits: 900_000n }),
]

describe('quoteCoinUsage', () => {
  it('charges cost x 1,000 coins per dollar x margin', () => {
    // 60 s x $0.12/h = $0.002 = 2 coins at cost, 3 coins at margin 1.5.
    const quote = quoteCoinUsage(RATES, { kind: 'stt', units: { second: 60 }, at: AT })
    expect(quote.costUsdMicro).toBe(2_000n)
    expect(quote.chargedMicro).toBe(3_000_000n)
    expect(quote.marginBps).toBe(15_000)
  })

  it('sums input and output tokens and rounds the charge up to a whole micro-coin', () => {
    // 80 in x $0.10/1M + 20 out x $0.50/1M = 18 micro-USD -> 18,000 micro-coins x 1.5.
    const quote = quoteCoinUsage(RATES, { kind: 'translation', model: 'gpt-6-luna', units: { input_token: 80, output_token: 20 }, at: AT })
    expect(quote.chargedMicro).toBe(27_000n)
    expect(quote.components.map(component => component.rateId)).toEqual(['tr-in', 'tr-out'])
  })

  it('falls back to the "*" row and reports units that have no rate', () => {
    const quote = quoteCoinUsage(RATES, { kind: 'translation', model: 'unknown-model', units: { input_token: 10, output_token: 10 }, at: AT })
    expect(quote.components.map(component => component.rateId)).toEqual(['tr-any-in'])
    expect(quote.unpricedUnits).toEqual(['output_token'])
  })

  it('ignores zero, negative and non-finite quantities', () => {
    const quote = quoteCoinUsage(RATES, { kind: 'stt', units: { second: 0, char: Number.NaN }, at: AT })
    expect(quote.chargedMicro).toBe(0n)
    expect(quote.components).toEqual([])
  })
})

describe('selectCoinPricingRate', () => {
  it('uses the row in effect at the charge time', () => {
    const rows = [
      rate({ id: 'old', kind: 'stt', unit: 'second', usdMicroPerMillionUnits: 1n, effectiveTo: new Date('2026-06-01T00:00:00Z') }),
      rate({ id: 'new', kind: 'stt', unit: 'second', usdMicroPerMillionUnits: 2n, effectiveFrom: new Date('2026-06-01T00:00:00Z') }),
      rate({ id: 'future', kind: 'stt', unit: 'second', usdMicroPerMillionUnits: 3n, effectiveFrom: new Date('2027-01-01T00:00:00Z') }),
    ]
    expect(selectCoinPricingRate(rows, { kind: 'stt', model: null, unit: 'second', at: AT })?.id).toBe('new')
    expect(selectCoinPricingRate(rows, { kind: 'stt', model: null, unit: 'second', at: new Date('2026-03-01T00:00:00Z') })?.id).toBe('old')
  })
})
