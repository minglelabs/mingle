import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'

// Opt in to an isolated DB containing the migration; normal unit tests never connect.
const context = vi.hoisted(() => ({ url: process.env.PROFILE_BIO_TEST_DATABASE_URL }))
vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client')
  return { prisma: new PrismaClient({ datasources: { db: { url: context.url || 'postgresql://unused@localhost:1/unused?schema=app' } } }) }
})
import { prisma } from '@/lib/prisma'
import { getBioSnapshot, getPublishedBioText, runBioVersion, requestBioTranslation, updateProfileWithBio } from '@/server/profile-bio'
import type { BioTranslator } from '@/server/profile-bio-provider'

const db = prisma as PrismaClient
const owner = `bio-test-${randomUUID()}`
const viewer = `bio-view-${randomUUID()}`
const calls: Array<{ text: string; language: string | null }> = []
const translate: BioTranslator = async (text, language) => {
  calls.push({ text, language })
  return language ? `${language}: ${text}` : 'ko'
}
const save = (bio: string | null) => updateProfileWithBio(owner, bio, tx => tx.user.update({ where: { id: owner }, data: { bio } }))
const read = (language = 'en') => getBioSnapshot(owner, viewer, language, language)
async function published(text = '원문 소개') {
  const saved = await save(text)
  await runBioVersion(saved.versionId!, translate)
  return saved.versionId!
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(r => { resolve = r })
  return { promise, resolve }
}

describe.skipIf(!context.url)('profile bio lifecycle with real DB locks', () => {
  beforeEach(async () => {
    for (const id of [owner, viewer]) await db.user.upsert({ where: { id }, create: { id, handle: id, primaryLanguages: ['en'] }, update: {} })
    await db.profileBioState.deleteMany({ where: { userId: owner } })
    await db.profileBioVersion.deleteMany({ where: { userId: owner } })
    await db.user.update({ where: { id: owner }, data: { bio: null } })
    calls.length = 0
  })
  afterAll(async () => { await db.user.deleteMany({ where: { id: { in: [owner, viewer] } } }); await db.$disconnect() })
  it('publishes the first original immediately and translates the four defaults except the source', async () => {
    const saved = await save('원문 소개')
    expect(await read()).toMatchObject({ original: '원문 소개', translation: null, updating: true })
    await runBioVersion(saved.versionId!, translate)
    expect(calls.map(call => call.language).sort()).toEqual([null, 'en', 'zh-CN', 'ja'].sort())
    expect(await read()).toMatchObject({ translation: 'en: 원문 소개', updating: false })
    expect(await requestBioTranslation(owner, 'ko')).toBeNull()
  })
  it('does not regenerate unchanged text or name/photo-only changes', async () => {
    await published()
    expect((await save('원문 소개')).versionId).toBeNull()
    const name = await updateProfileWithBio(owner, undefined, tx => tx.user.update({ where: { id: owner }, data: { name: 'New name' } }))
    expect(name.versionId).toBeNull()
    expect(await db.profileBioVersion.count({ where: { userId: owner } })).toBe(1)
  })
  it('coalesces eight concurrent requests and shares their saved result', async () => {
    await published()
    const requests = await Promise.all(Array.from({ length: 8 }, () => requestBioTranslation(owner, 'fr')))
    expect(requests.filter(Boolean)).toHaveLength(1)
    await requests.find(Boolean)!(translate)
    expect(calls.filter(call => call.language === 'fr')).toHaveLength(1)
    expect(await requestBioTranslation(owner, 'fr')).toBeNull()
    expect(await read('fr')).toMatchObject({ translation: 'fr: 원문 소개' })
  })
  it('keeps the old public version, retranslates additional languages, and retries failures only on request', async () => {
    await published()
    await (await requestBioTranslation(owner, 'fr'))!(translate)
    const saved = await save('수정 소개')
    expect(await read('fr')).toMatchObject({ original: '원문 소개', translation: 'fr: 원문 소개' })
    expect(await getBioSnapshot(owner, owner, 'en')).toMatchObject({ draft: { original: '수정 소개', status: 'running' } })
    await runBioVersion(saved.versionId!, async (text, language, signal) => { if (language === 'ja') throw Error('provider failure'); return translate(text, language, signal) })
    expect(await read('fr')).toMatchObject({ original: '수정 소개', translation: 'fr: 수정 소개' })
    expect(await read('ja')).toMatchObject({ status: 'failed', translation: null })
    const count = calls.length
    await read('ja'); await read('ja')
    expect(calls).toHaveLength(count)
    await (await requestBioTranslation(owner, 'ja'))!(translate)
    expect(await read('ja')).toMatchObject({ status: 'succeeded' })
  })
  it('never lets a previous edit overwrite a newer published version', async () => {
    await published()
    const old = await save('이전 편집'), started = deferred(), release = deferred()
    const worker = runBioVersion(old.versionId!, async (text, language, signal) => { started.resolve(); await release.promise; return translate(text, language, signal) })
    await started.promise
    await published('최신 편집')
    release.resolve(); await worker
    expect(await read()).toMatchObject({ original: '최신 편집' })
  })
  it('settles an abandoned batch after its deadline without starting another attempt', async () => {
    await published()
    const saved = await save('시간 초과')
    await db.profileBioVersion.update({ where: { id: saved.versionId! }, data: { deadlineAt: new Date(Date.now() - 1) } })
    const count = calls.length
    expect(await read()).toMatchObject({ original: '시간 초과', translation: null, updating: false })
    expect(calls).toHaveLength(count)
  })
  it('bounds a stuck provider and publishes the new original with missing translations', async () => {
    await published()
    const saved = await save('중단된 요청')
    await db.profileBioVersion.update({ where: { id: saved.versionId! }, data: { deadlineAt: new Date(Date.now() + 100) } })
    await runBioVersion(saved.versionId!, async () => new Promise<string>(() => {}))
    expect(await read()).toMatchObject({ original: '중단된 요청', translation: null, updating: false })
  })
  it('rejects a late manual result after its task expired, then permits an explicit retry', async () => {
    const versionId = await published(), started = deferred(), release = deferred()
    const job = await requestBioTranslation(owner, 'fr')
    const worker = job!(async (text, language, signal) => { started.resolve(); await release.promise; return translate(text, language, signal) })
    await started.promise
    await db.profileBioTranslation.update({ where: { versionId_language: { versionId, language: 'fr' } }, data: { deadlineAt: new Date(Date.now() - 1) } })
    expect(await read('fr')).toMatchObject({ status: 'failed' })
    release.resolve(); await worker
    expect(await read('fr')).toMatchObject({ translation: null, status: 'failed' })
    await (await requestBioTranslation(owner, 'fr'))!(translate)
    expect(await read('fr')).toMatchObject({ status: 'succeeded' })
  })
  it('removes a bio immediately and never restores it from an in-flight result', async () => {
    await published()
    const saved = await save('삭제할 소개'), started = deferred(), release = deferred()
    const worker = runBioVersion(saved.versionId!, async (text, language, signal) => { started.resolve(); await release.promise; return translate(text, language, signal) })
    await started.promise
    await save(null)
    expect(await read()).toMatchObject({ original: '', translation: null })
    release.resolve(); await worker
    expect(await read()).toMatchObject({ original: '' })
    expect(await requestBioTranslation(owner, 'fr')).toBeNull()
  })
  it('preserves legacy biographies until edited or explicitly translated', async () => {
    await db.user.update({ where: { id: owner }, data: { bio: '기존 소개' } })
    expect(await read()).toMatchObject({ original: '기존 소개', versionId: null })
    expect(calls).toHaveLength(0)
    const saved = await save('새 소개')
    expect(await getPublishedBioText(owner, '새 소개')).toBe('기존 소개')
    await runBioVersion(saved.versionId!, translate)
    expect(await read()).toMatchObject({ original: '새 소개' })
  })
})
