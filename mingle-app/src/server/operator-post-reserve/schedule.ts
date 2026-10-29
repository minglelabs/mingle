/**
 * When an operator account's next latent post goes out. Pure and seeded by
 * the caller's `random`, so it is unit-tested without a clock.
 *
 * The gap between two posts of one account is `24h / postsPerDay`, jittered
 * to 60-140 % so accounts never fall into a visible rhythm. A time that lands
 * in the persona country's night (00:00-08:00 local) moves to that morning,
 * 08:00-11:00, because nobody posts at 4 am every other day.
 */
const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS
const WAKE_HOUR = 8
const MORNING_SPREAD_HOURS = 3

/** Standard-time UTC offsets (hours) of the persona countries; DST is ignored (an hour off is harmless here). */
const UTC_OFFSET_HOURS: Record<string, number> = {
  KR: 9, JP: 9, TW: 8, CN: 8, VN: 7, TH: 7, ID: 7, PH: 8, MY: 8, SG: 8, IN: 5.5,
  US: -6, CA: -5, GB: 0, AU: 10, FR: 1, DE: 1, ES: 1, IT: 1, BR: -3, MX: -6, AR: -3, TR: 3,
}

export function utcOffsetHoursOf(personaCountry: string | null | undefined): number {
  return UTC_OFFSET_HOURS[(personaCountry ?? '').toUpperCase()] ?? 0
}

/** Moves a time inside the local night to the same day's morning. */
export function avoidLocalNight(at: Date, offsetHours: number, random: () => number): Date {
  const localMs = at.getTime() + offsetHours * HOUR_MS
  const msIntoDay = ((localMs % DAY_MS) + DAY_MS) % DAY_MS
  if (msIntoDay >= WAKE_HOUR * HOUR_MS) return at
  const morning = WAKE_HOUR * HOUR_MS + random() * MORNING_SPREAD_HOURS * HOUR_MS
  return new Date(at.getTime() - msIntoDay + morning)
}

/**
 * The release time of an account's next latent post. `lastAt` is its previous
 * post or release (null for an account that never posted, which then starts
 * somewhere inside its first gap instead of all accounts starting at once).
 */
export function nextReleaseAt(args: {
  now: Date
  lastAt: Date | null
  postsPerDay: number
  personaCountry: string | null | undefined
  random?: () => number
}): Date {
  const random = args.random ?? Math.random
  const gapMs = DAY_MS / Math.max(0.1, args.postsPerDay)
  const candidate = args.lastAt
    ? args.lastAt.getTime() + gapMs * (0.6 + 0.8 * random())
    : args.now.getTime() + gapMs * random()
  // An account that fell behind (server was down, reserve was empty) resumes soon, not all at once.
  const earliest = args.now.getTime() + 5 * 60_000 * random()
  return avoidLocalNight(new Date(Math.max(candidate, earliest)), utcOffsetHoursOf(args.personaCountry), random)
}
