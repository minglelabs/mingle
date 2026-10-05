import type { Prisma } from '@prisma/client/index'
import { prisma } from '@/lib/prisma'

// Charged coins = cost (USD) x 1,000 x margin (docs/coin-iap-spec.md 4.1).
// Rates live in app_coin_pricing_rates, never in code.

export type CoinUsageKind = 'stt' | 'translation' | 'tts' | 'image_text'
export type CoinPricingUnit = 'second' | 'input_token' | 'output_token' | 'char' | 'image'
export const COIN_USAGE_KINDS: readonly CoinUsageKind[] = ['stt', 'translation', 'tts', 'image_text']
export const COIN_PRICING_UNITS: readonly CoinPricingUnit[] = ['second', 'input_token', 'output_token', 'char', 'image']

export type CoinUsageUnits = Partial<Record<CoinPricingUnit, number>>

export type CoinPricingRateRow = {
  id: string
  kind: string
  model: string
  unit: string
  usdMicroPerMillionUnits: bigint
  marginBps: number
  effectiveFrom: Date
  effectiveTo: Date | null
}

export type CoinPriceComponent = {
  rateId: string
  unit: CoinPricingUnit
  quantity: number
  usdMicroPerMillionUnits: string
  marginBps: number
}

export type CoinPriceQuote = {
  chargedMicro: bigint
  costUsdMicro: bigint
  marginBps: number
  pricingRateId: string | null
  components: CoinPriceComponent[]
  // Units that had a quantity but no rate; they are not charged.
  unpricedUnits: CoinPricingUnit[]
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return numerator <= 0n ? 0n : (numerator + denominator - 1n) / denominator
}

/** The rate for one unit: an exact model row wins over the "*" fallback; the latest effective row wins. */
export function selectCoinPricingRate(
  rates: readonly CoinPricingRateRow[],
  input: { kind: CoinUsageKind; model: string | null | undefined; unit: CoinPricingUnit; at: Date },
): CoinPricingRateRow | null {
  const model = (input.model || '').trim().toLowerCase()
  const active = rates.filter(rate => rate.kind === input.kind
    && rate.unit === input.unit
    && rate.effectiveFrom.getTime() <= input.at.getTime()
    && (!rate.effectiveTo || rate.effectiveTo.getTime() > input.at.getTime()))
  const latest = (rows: CoinPricingRateRow[]) => rows
    .sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime())[0] ?? null
  return latest(active.filter(rate => model && rate.model.toLowerCase() === model))
    ?? latest(active.filter(rate => rate.model === '*'))
}

export function quoteCoinUsage(
  rates: readonly CoinPricingRateRow[],
  input: { kind: CoinUsageKind; model?: string | null; units: CoinUsageUnits; at: Date },
): CoinPriceQuote {
  const components: CoinPriceComponent[] = []
  const unpricedUnits: CoinPricingUnit[] = []
  // Sum of quantity x rate, in micro-USD per million units (exact).
  let costNumerator = 0n
  // Same, weighted by each row's margin in basis points.
  let chargeNumerator = 0n

  for (const unit of COIN_PRICING_UNITS) {
    const rawQuantity = input.units[unit]
    if (typeof rawQuantity !== 'number' || !Number.isFinite(rawQuantity) || rawQuantity <= 0) continue
    const quantity = Math.ceil(rawQuantity)
    const rate = selectCoinPricingRate(rates, { kind: input.kind, model: input.model, unit, at: input.at })
    if (!rate) {
      unpricedUnits.push(unit)
      continue
    }
    const product = BigInt(quantity) * rate.usdMicroPerMillionUnits
    costNumerator += product
    chargeNumerator += product * BigInt(rate.marginBps)
    components.push({
      rateId: rate.id,
      unit,
      quantity,
      usdMicroPerMillionUnits: rate.usdMicroPerMillionUnits.toString(),
      marginBps: rate.marginBps,
    })
  }

  // micro-USD = numerator / 1e6. 1 micro-USD = 1,000 micro-coins, margin is /1e4:
  // micro-coins = numerator x margin_bps x 1,000 / (1e6 x 1e4) = chargeNumerator / 1e7, rounded up.
  return {
    chargedMicro: ceilDiv(chargeNumerator, 10_000_000n),
    costUsdMicro: ceilDiv(costNumerator, 1_000_000n),
    marginBps: components[0]?.marginBps ?? 0,
    pricingRateId: components[0]?.rateId ?? null,
    components,
    unpricedUnits,
  }
}

const RATE_CACHE_TTL_MS = 60_000
let rateCache: { loadedAt: number; rates: CoinPricingRateRow[] } | null = null

export function clearCoinPricingRateCache(): void {
  rateCache = null
}

/** Rates that are open or closed recently enough to still price a late charge. */
export async function loadCoinPricingRates(
  client: Prisma.TransactionClient | typeof prisma = prisma,
  now = new Date(),
): Promise<CoinPricingRateRow[]> {
  if (rateCache && now.getTime() - rateCache.loadedAt < RATE_CACHE_TTL_MS) return rateCache.rates
  const rates = await client.appCoinPricingRate.findMany({
    where: { OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }] },
    select: {
      id: true,
      kind: true,
      model: true,
      unit: true,
      usdMicroPerMillionUnits: true,
      marginBps: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  })
  rateCache = { loadedAt: now.getTime(), rates }
  return rates
}
