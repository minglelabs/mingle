import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

// Opt in with a DB that has the migrations applied. Everything runs in one transaction that is
// rolled back, and the TimeZone change is SET LOCAL, so nothing leaks onto pooled connections.
const url = process.env.UPDATED_AT_TEST_DATABASE_URL
const db = new PrismaClient({ datasources: { db: { url: url || 'postgresql://unused@localhost:1/unused?schema=app' } } })
const ROLLBACK = new Error('rollback')

describe.skipIf(!url)('app.set_updated_at trigger with a non-UTC session TimeZone', () => {
  afterAll(async () => { await db.$disconnect() })

  it('keeps updated_at in UTC next to Prisma-written created_at', async () => {
    let observed: { createdAt: Date; updatedAt: Date; utcNow: Date } | null = null
    await db.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'Asia/Seoul'`
      const row = await tx.appEventLog.create({ data: { eventType: 'updated_at_trigger_test' } })
      const updated = await tx.appEventLog.update({ where: { id: row.id }, data: { usageSec: 1 } })
      const [{ utcNow }] = await tx.$queryRaw<Array<{ utcNow: Date }>>`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::timestamp(3) AS "utcNow"`
      observed = { createdAt: row.createdAt, updatedAt: updated.updatedAt, utcNow }
      throw ROLLBACK
    }).catch(error => { if (error !== ROLLBACK) throw error })

    expect(observed).not.toBeNull()
    const { createdAt, updatedAt, utcNow } = observed!
    expect(updatedAt.getTime()).toBe(utcNow.getTime())
    // created_at comes from the app clock, updated_at from the transaction start; a TimeZone skew would be hours.
    expect(Math.abs(updatedAt.getTime() - createdAt.getTime())).toBeLessThan(60_000)
  })
})
