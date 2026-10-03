/** The seed plan lives with the server code (automatic creation uses it too); re-exported for the page. */
export {
  DEFAULT_SEED_PLAN,
  SEED_CHUNK_SIZE,
  SEED_MAX_PER_COUNTRY,
  defaultSeedRows,
  parseSeedCount,
  seedPlanTotal,
  type SeedPlanRow,
} from '@/server/operators/seed-plan'
