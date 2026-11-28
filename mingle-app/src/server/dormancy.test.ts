import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { canReleaseDormancy, isDormantAccount } from '@/server/dormancy'
import { visibleAuthorWhere } from '@/server/posts/block-visibility'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const account = { dormantAt: new Date(), isOperator: false, isOfficial: false, email: 'a@example.com', phoneE164: null }
const photo = { image: 'https://cdn.example/p.jpg', imageFaceCheck: 'face', faceVerifiedAt: null, gender: 'male' }

describe('dormant accounts', () => {
  it('is an account put to sleep, never an operator or the official account', () => {
    expect(isDormantAccount(account, {} as NodeJS.ProcessEnv)).toBe(true)
    expect(isDormantAccount({ ...account, dormantAt: null }, {} as NodeJS.ProcessEnv)).toBe(false)
    expect(isDormantAccount({ ...account, isOperator: true }, {} as NodeJS.ProcessEnv)).toBe(false)
    expect(isDormantAccount({ ...account, isOfficial: true }, {} as NodeJS.ProcessEnv)).toBe(false)
  })

  it('wakes a man with a photo and the selfie check, a woman with the photo alone', () => {
    expect(canReleaseDormancy({ ...photo, image: null })).toBe(false)
    expect(canReleaseDormancy({ ...photo, image: null, gender: 'female' })).toBe(false)
    expect(canReleaseDormancy(photo)).toBe(false)
    expect(canReleaseDormancy({ ...photo, faceVerifiedAt: new Date() })).toBe(true)
    expect(canReleaseDormancy({ ...photo, gender: 'female' })).toBe(true)
    expect(canReleaseDormancy({ ...photo, gender: null })).toBe(false)
    // A photo the phone found no face in never wakes the account.
    expect(canReleaseDormancy({ ...photo, gender: 'female', imageFaceCheck: 'no_face' })).toBe(false)
    expect(canReleaseDormancy({ ...photo, imageFaceCheck: 'no_face', faceVerifiedAt: new Date() })).toBe(false)
  })

  // 2026-11-29: the owner chose not to put existing accounts to sleep at release.
  it('adds the column without putting existing accounts to sleep', () => {
    const sql = read('prisma/migrations/20261125160000_add_dormant_at/migration.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "dormant_at"')
    expect(sql).not.toContain('UPDATE "app"')
  })

  it('is hidden by the one rule every list of accounts and their content follows', () => {
    // Posts, comments, profile grids and post search: the shared author rule.
    expect(visibleAuthorWhere(null)).toEqual({ moderationHiddenAt: null, dormantAt: null })
    expect(visibleAuthorWhere('viewer')).toMatchObject({ moderationHiddenAt: null, dormantAt: null })
    for (const [file, alias] of [
      ['src/app/api/search/posts/post-search-query.ts', 'a'],
      ['src/app/api/users/search/people-search-query.ts', 'u'],
      ['src/server/people-discovery.ts', 'u'],
    ]) {
      const sql = read(file)
      expect(sql).toContain(`AND ${alias}.moderation_hidden_at IS NULL`)
      expect(sql).toContain(`AND ${alias}.dormant_at IS NULL`)
    }
  })

  it('wakes without touching a hide by staff, and is never used by staff hides', () => {
    const dormancy = read('src/server/dormancy.ts')
    expect(dormancy).toContain('data: { dormantAt: null }')
    expect(dormancy).not.toContain('moderationHiddenAt')
    // A report hide and 내리고 검토로 keep their own mark.
    expect(read('src/server/reports/moderation-service.ts')).not.toContain('dormantAt')
    expect(read('src/server/operators/account-takedown.ts')).not.toContain('dormantAt')
  })

  it('is shown the wake-up screen, and woken by the photo and selfie routes', () => {
    expect(read('src/app/layout.tsx')).toContain('<DormantAccountGate />')
    expect(read('src/app/api/profile/route.ts')).toContain('dormant: privateFields ? isDormantAccount(privateFields) : false')
    expect(read('src/app/api/profile/image/route.ts')).toContain('releaseDormancyIfReady(userId)')
    expect(read('src/app/api/profile/face-verification/route.ts')).toContain('releaseDormancyIfReady(userId)')
  })
})
