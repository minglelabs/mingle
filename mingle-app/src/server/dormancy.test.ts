import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { canReleaseDormancy, isDormantAccount } from '@/server/dormancy'

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

  it('puts accounts without a photo to sleep once, and leaves operators alone', () => {
    const sql = read('prisma/migrations/20261125160000_add_dormant_at/migration.sql')
    expect(sql).toContain('"image" IS NULL OR btrim("image") = \'\'')
    expect(sql).toContain('"is_operator" = false')
    expect(sql).toContain('"is_official" = false')
  })

  it('is hidden from explore, shown the wake-up screen, and woken by the photo and selfie routes', () => {
    expect(read('src/server/people-discovery.ts')).toContain('AND u.dormant_at IS NULL')
    expect(read('src/app/layout.tsx')).toContain('<DormantAccountGate />')
    expect(read('src/app/api/profile/route.ts')).toContain('dormant: privateFields ? isDormantAccount(privateFields) : false')
    expect(read('src/app/api/profile/image/route.ts')).toContain('releaseDormancyIfReady(userId)')
    expect(read('src/app/api/profile/face-verification/route.ts')).toContain('releaseDormancyIfReady(userId)')
  })
})
