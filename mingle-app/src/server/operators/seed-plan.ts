import { PERSONA_COUNTRIES } from './persona-countries'

/**
 * Default mix for seeding 100 operator accounts: Korea and Japan carry the
 * weight (22 each), the rest are spread over the large-population and
 * major-language countries of the persona table. Staff edit the numbers
 * before a manual run; automatic creation keeps the account pool close to
 * these proportions. A country missing here defaults to 0.
 */
export const DEFAULT_SEED_PLAN: Readonly<Record<string, number>> = {
  KR: 22, JP: 22, US: 7, CN: 5, TW: 5, VN: 4, ID: 4, IN: 4, TH: 3, PH: 3, BR: 3,
  MY: 2, GB: 2, FR: 2, DE: 2, ES: 2, IT: 2, TR: 2, SG: 1, MX: 1, CA: 1, AU: 1,
}

export const SEED_MAX_PER_COUNTRY = 200
/** Accounts asked for per request (one drafts call + one create call). */
export const SEED_CHUNK_SIZE = 10

export type SeedPlanRow = { code: string; nameKo: string; count: number }

/** One row per persona country, in table order, with the default counts. */
export function defaultSeedRows(): SeedPlanRow[] {
  return PERSONA_COUNTRIES.map((country) => ({
    code: country.code,
    nameKo: country.nameKo,
    count: DEFAULT_SEED_PLAN[country.code] ?? 0,
  }))
}

export function seedPlanTotal(rows: ReadonlyArray<Pick<SeedPlanRow, 'count'>>): number {
  return rows.reduce((total, row) => total + (Number.isInteger(row.count) && row.count > 0 ? row.count : 0), 0)
}

/** A count typed by staff: a whole number within 0-200, else 0. */
export function parseSeedCount(raw: string): number {
  const value = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : 0
  return Math.min(SEED_MAX_PER_COUNTRY, Math.max(0, value))
}

/**
 * The country furthest below its share of the plan, given how many accounts
 * each country has now. Ties go to the larger planned share.
 */
export function mostUnderrepresentedCountry(currentByCountry: ReadonlyMap<string, number>): string {
  const planTotal = Object.values(DEFAULT_SEED_PLAN).reduce((sum, count) => sum + count, 0)
  const currentTotal = [...currentByCountry.values()].reduce((sum, count) => sum + count, 0)
  let best = 'KR'
  let bestDeficit = Number.NEGATIVE_INFINITY
  for (const [code, planned] of Object.entries(DEFAULT_SEED_PLAN)) {
    // Expected count if one more account were added, minus what exists.
    const deficit = (planned / planTotal) * (currentTotal + 1) - (currentByCountry.get(code) ?? 0)
    if (deficit > bestDeficit + 1e-9 || (Math.abs(deficit - bestDeficit) <= 1e-9 && planned > (DEFAULT_SEED_PLAN[best] ?? 0))) {
      best = code
      bestDeficit = deficit
    }
  }
  return best
}
