import { Prisma } from '@prisma/client'

/**
 * A JS Date as a SQL `timestamp` (without time zone) in UTC, the way Prisma
 * stores `DateTime` columns. Comparing the columns to `now()` instead would
 * shift by the session time zone, so raw SQL always binds the caller's clock.
 */
export function sqlUtcTimestamp(date: Date): Prisma.Sql {
  return Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`
}
