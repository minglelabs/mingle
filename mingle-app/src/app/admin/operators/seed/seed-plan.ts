import { PERSONA_COUNTRIES } from '@/server/operators/persona-countries'

/**
 * Default mix for seeding 100 operator accounts: Korea and Japan carry the
 * weight (22 each), the rest are spread over the large-population and
 * major-language countries of the persona table. Staff edit the numbers
 * before starting; a country missing here defaults to 0.
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
