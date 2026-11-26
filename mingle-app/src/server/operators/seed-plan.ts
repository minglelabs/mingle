import { PERSONA_COUNTRIES } from './persona-countries'

/**
 * Default mix for seeding 108 operator accounts: Korea and Japan carry the
 * weight (22 each), the rest are spread over the large-population and
 * major-language countries of the persona table. Staff edit the numbers
 * before a manual run; automatic creation keeps the account pool close to
 * these proportions. A country missing here defaults to 0.
 */
export const DEFAULT_SEED_PLAN: Readonly<Record<string, number>> = {
  // Staff (2026-11-25): far more Korea, Japan, China and Taiwan (about two thirds together).
  // Staff (2026-11-26): more Korea (men especially, see SEED_MALE_LEANING), a little less Taiwan.
  KR: 35, JP: 25, CN: 10, TW: 6, US: 4, VN: 2, ID: 2, IN: 2, BR: 2, TH: 2, PH: 2, TR: 2,
  MY: 1, GB: 1, FR: 1, DE: 1, ES: 1, IT: 1, RU: 1, SG: 1, MX: 1, CA: 1, AU: 1,
  // Staff (2026-11-23): a few from Russia, the Middle East and Central Asia, never none.
  SA: 1, AE: 1, KZ: 1, UZ: 1,
}

/**
 * Countries whose new accounts lean male (about 70%) when the profile photo
 * does not already fix the gender (staff, 2026-11-26: more Korean men).
 */
export const SEED_MALE_LEANING: ReadonlySet<string> = new Set(['KR'])
export const SEED_MALE_SHARE = 0.7

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
export function mostUnderrepresentedCountry(currentByCountry: ReadonlyMap<string, number>, allowed?: readonly string[] | null): string {
  const planTotal = Object.values(DEFAULT_SEED_PLAN).reduce((sum, count) => sum + count, 0)
  const currentTotal = [...currentByCountry.values()].reduce((sum, count) => sum + count, 0)
  let best = 'KR'
  let bestDeficit = Number.NEGATIVE_INFINITY
  const plan = Object.entries(DEFAULT_SEED_PLAN).filter(([code]) => !allowed?.length || allowed.includes(code))
  // Only countries the caller allows (e.g. ones a reference photo's person suits).
  if (plan.length && allowed?.length) best = plan[0][0]
  for (const [code, planned] of plan.length ? plan : Object.entries(DEFAULT_SEED_PLAN)) {
    // Expected count if one more account were added, minus what exists.
    const deficit = (planned / planTotal) * (currentTotal + 1) - (currentByCountry.get(code) ?? 0)
    if (deficit > bestDeficit + 1e-9 || (Math.abs(deficit - bestDeficit) <= 1e-9 && planned > (DEFAULT_SEED_PLAN[best] ?? 0))) {
      best = code
      bestDeficit = deficit
    }
  }
  return best
}
