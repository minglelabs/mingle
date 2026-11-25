import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { blocksNewRoomFrom } from '@/server/male-dm-block'
import { buildPeopleDiscoverySql, parsePeopleDiscoveryFilters } from '@/server/people-discovery'
import { latestVisitPerVisitor, VISITOR_UNLOCK_COINS } from '@/server/profile-visitors'
import { resolvePeopleSafetyCopy } from '@/i18n/people-safety-copy'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('a woman can stop new rooms from men', () => {
  const man = { gender: 'male', isOperator: false, isOfficial: false }
  it('stops only a man writing to a woman who turned it on', () => {
    expect(blocksNewRoomFrom(man, { gender: 'female', blockMaleDms: true })).toBe(true)
    expect(blocksNewRoomFrom(man, { gender: 'female', blockMaleDms: false })).toBe(false)
    expect(blocksNewRoomFrom({ ...man, gender: 'female' }, { gender: 'female', blockMaleDms: true })).toBe(false)
    expect(blocksNewRoomFrom({ ...man, isOperator: true }, { gender: 'female', blockMaleDms: true })).toBe(false)
    expect(blocksNewRoomFrom(man, { gender: 'male', blockMaleDms: true })).toBe(false)
    expect(blocksNewRoomFrom(null, { gender: 'female', blockMaleDms: true })).toBe(false)
  })

  it('is checked before a first room opens, and the client says so', () => {
    const controller = read('src/server/api/controllers/shared/conversations-controller.ts')
    expect(controller).toContain('if (await isNewRoomBlockedForMen(resolvedUser.userId, targetUserId))')
    expect(controller).toContain('{ error: "recipient_blocks_men" }, { status: 403 }')
    expect(read('src/lib/use-start-direct-conversation.ts')).toContain('return { kind: "recipient_blocks_men" }')
    expect(read('src/components/my-page.tsx')).toContain('profile.gender === "female" ? (')
    expect(read('prisma/schema.prisma')).toContain('@map("block_male_dms")')
  })
})

describe('explore filters', () => {
  it('reads gender, an age range and online only; the range ends mean no limit', () => {
    expect(parsePeopleDiscoveryFilters(new URLSearchParams('gender=female&ageMin=25&ageMax=34&online=1'))).toEqual({ gender: 'female', ageMin: 25, ageMax: 34, onlineOnly: true })
    expect(parsePeopleDiscoveryFilters(new URLSearchParams('gender=x&ageMin=18&ageMax=60'))).toEqual({ gender: null, ageMin: null, ageMax: null, onlineOnly: false })
    expect(parsePeopleDiscoveryFilters(new URLSearchParams('ageMin=40&ageMax=30'))).toMatchObject({ ageMin: 30, ageMax: 40 })
    expect(parsePeopleDiscoveryFilters(new URLSearchParams('ageMin=5'))).toMatchObject({ ageMin: null })
  })

  it('puts them in the WHERE clause, by birth date', () => {
    const sql = buildPeopleDiscoverySql({
      viewerId: 'v', viewerIsKorean: true, cursor: null, take: 21, now: new Date('2026-11-25T00:00:00Z'),
      filters: { gender: 'female', ageMin: 25, ageMax: 34, onlineOnly: true },
    }) as Prisma.Sql
    expect(sql.sql).toContain('AND u.gender = ?')
    expect(sql.sql).toContain('AND u.birth_date <= ?::date')
    expect(sql.sql).toContain('AND u.birth_date > ?::date')
    expect(sql.values).toContain('female')
    expect(sql.values).toContain('2001-11-25')
    expect(sql.values).toContain('1991-11-25')
    const none = buildPeopleDiscoverySql({ viewerId: 'v', viewerIsKorean: true, cursor: null, take: 21 }) as Prisma.Sql
    expect(none.sql).not.toContain('u.gender =')
  })
})

describe('who viewed my profile', () => {
  it('keeps the latest visit of each person, never the owner', () => {
    const at = (minutes: number) => new Date(Date.UTC(2026, 10, 25, 0, minutes))
    const rows = [
      { id: '1', viewerId: 'a', createdAt: at(1) },
      { id: '2', viewerId: 'b', createdAt: at(2) },
      { id: '3', viewerId: 'a', createdAt: at(3) },
      { id: '4', viewerId: 'me', createdAt: at(4) },
    ]
    expect(latestVisitPerVisitor(rows, 'me').map((row) => row.id)).toEqual(['3', '2'])
    expect(latestVisitPerVisitor(rows, 'me', 1).map((row) => row.id)).toEqual(['3'])
  })

  it('costs 30 Hash, sends nothing about a locked visitor, and is on My page', () => {
    expect(VISITOR_UNLOCK_COINS).toBe(30)
    const server = read('src/server/profile-visitors.ts')
    expect(server).toContain(': { token: row.id, unlocked: false, visitedAt });')
    expect(server).toContain('if (taken.shortfallMicro > 0n) throw new ProfileVisitorError("insufficient_coins");')
    expect(read('src/components/my-page.tsx')).toContain('<ProfileVisitorsSection locale={locale} />')
    for (const ns of ['ios', 'android']) {
      expect(read(`src/app/api/${ns}/v2.2.0/profile/visitors/route.ts`)).toContain('export { GET }')
      expect(read(`src/app/api/${ns}/v2.2.0/profile/visitors/unlock/route.ts`)).toContain('export { POST }')
    }
  })
})

describe('copy', () => {
  it('has every string in all app languages', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolvePeopleSafetyCopy(locale)
      for (const value of Object.values(copy)) expect(value.trim().length).toBeGreaterThan(0)
      expect(copy.visitorsUnlock).toContain('{coins}')
    }
  })
})
