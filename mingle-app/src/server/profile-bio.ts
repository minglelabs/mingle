import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { BIO_DEFAULT_LANGUAGES, resolveBioDisplayLanguage, sameBioLanguage, type ProfileBioSnapshot } from '@/lib/profile-bio'
import { translateProfileBio, type BioTranslator } from './profile-bio-provider'

const BATCH_TIMEOUT_MS = 55_000
const TASK_TIMEOUT_MS = 17_000
const SOURCE_TASK = '__source__'
type Tx = Prisma.TransactionClient

// Serialize only state changes, never hold a database transaction during translation.
async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM app_users WHERE id = ${userId} FOR UPDATE`
}

export async function prepareBioEdit(tx: Tx, userId: string, oldText: string | null, newText: string | null): Promise<string | null> {
  if (oldText === newText) return null
  const state = await tx.profileBioState.findUnique({ where: { userId } })
  if (!newText) {
    await tx.profileBioState.upsert({ where: { userId }, create: { userId }, update: { currentVersionId: null, publishedVersionId: null } })
    return null
  }
  let publishedVersionId = state?.publishedVersionId ?? null
  // Existing biographies are never bulk translated. Preserve their public text on first edit.
  if (!state && oldText) {
    const legacy = await tx.profileBioVersion.create({ data: { userId, sourceText: oldText, targetLanguages: [], status: 'complete', deadlineAt: new Date() } })
    publishedVersionId = legacy.id
  }
  const previousLanguages = await tx.profileBioTranslation.findMany({
    where: { version: { userId }, status: 'succeeded', language: { not: SOURCE_TASK } }, select: { language: true }, distinct: ['language'],
  })
  const targetLanguages = [...new Set([...BIO_DEFAULT_LANGUAGES, ...previousLanguages.map(row => row.language)])]
  const version = await tx.profileBioVersion.create({ data: { userId, sourceText: newText, targetLanguages, deadlineAt: new Date(Date.now() + BATCH_TIMEOUT_MS) } })
  await tx.profileBioState.upsert({
    where: { userId },
    create: { userId, currentVersionId: version.id, publishedVersionId: publishedVersionId ?? version.id },
    update: { currentVersionId: version.id, publishedVersionId: publishedVersionId ?? version.id },
  })
  return version.id
}

export async function updateProfileWithBio<T>(userId: string, bio: string | null | undefined, update: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await lockUser(tx, userId)
    const before = bio !== undefined ? await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { bio: true } }) : null
    const profile = await update(tx)
    const versionId = bio !== undefined ? await prepareBioEdit(tx, userId, before?.bio ?? null, bio) : null
    return { profile, versionId }
  })
}

async function settleVersion(versionId: string, force = false) {
  await prisma.$transaction(async tx => {
    const version = await tx.profileBioVersion.findUnique({ where: { id: versionId } })
    if (!version || (version.status === 'complete' && !force)) return
    await lockUser(tx, version.userId)
    if (force || (version.status !== 'complete' && version.deadlineAt.getTime() <= Date.now())) {
      await tx.profileBioTranslation.updateMany({ where: { versionId, status: 'running', language: { in: [...version.targetLanguages, SOURCE_TASK] } }, data: { status: 'failed', text: null } })
      await tx.profileBioVersion.update({ where: { id: versionId }, data: { status: 'complete' } })
    } else if (version.status !== 'complete') return
    // A late result can never publish over a subsequent edit or a deletion.
    await tx.profileBioState.updateMany({ where: { userId: version.userId, currentVersionId: versionId }, data: { publishedVersionId: versionId } })
  })
}

async function claimTask(versionId: string, language: string, retry: boolean, timeoutMs = TASK_TIMEOUT_MS): Promise<string | null> {
  return prisma.$transaction(async tx => {
    const version = await tx.profileBioVersion.findUnique({ where: { id: versionId } })
    if (!version) return null
    await lockUser(tx, version.userId)
    const state = await tx.profileBioState.findUnique({ where: { userId: version.userId } })
    if (state?.currentVersionId !== versionId && state?.publishedVersionId !== versionId) return null
    const key = { versionId_language: { versionId, language } }
    const existing = await tx.profileBioTranslation.findUnique({ where: key })
    if (existing && (existing.status === 'succeeded' || existing.status === 'running' || !retry)) return null
    const attemptId = randomUUID()
    const data = { status: 'running', text: null, attemptId, deadlineAt: new Date(Date.now() + timeoutMs) }
    await tx.profileBioTranslation.upsert({ where: key, create: { versionId, language, ...data }, update: data })
    return attemptId
  })
}

async function performTask(versionId: string, language: string, attemptId: string, translate: BioTranslator, parentSignal?: AbortSignal) {
  const signal = parentSignal ? AbortSignal.any([parentSignal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000)
  try {
    const version = await prisma.profileBioVersion.findUniqueOrThrow({ where: { id: versionId } })
    const text = await Promise.race([
      translate(version.sourceText, language === SOURCE_TASK ? null : language, signal),
      new Promise<never>((_, reject) => { if (signal.aborted) reject(new Error('timeout')); else signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }) }),
    ])
    if (signal.aborted) throw new Error('timeout')
    await prisma.$transaction(async tx => {
      const result = await tx.profileBioTranslation.updateMany({ where: { versionId, language, attemptId, status: 'running', deadlineAt: { gt: new Date() } }, data: { status: 'succeeded', text } })
      if (result.count && language === SOURCE_TASK) await tx.profileBioVersion.update({ where: { id: versionId }, data: { sourceLanguage: text } })
    })
  } catch {
    await prisma.profileBioTranslation.updateMany({ where: { versionId, language, attemptId, status: 'running' }, data: { status: 'failed', text: null } })
  }
}

export async function runBioVersion(versionId: string, translate: BioTranslator = translateProfileBio) {
  const claim = await prisma.profileBioVersion.updateMany({ where: { id: versionId, status: 'queued', deadlineAt: { gt: new Date() } }, data: { status: 'running' } })
  if (!claim.count) { await settleVersion(versionId); return }
  const initial = await prisma.profileBioVersion.findUniqueOrThrow({ where: { id: versionId } })
  const signal = AbortSignal.timeout(Math.max(1, initial.deadlineAt.getTime() - Date.now()))
  try {
    const sourceAttempt = await claimTask(versionId, SOURCE_TASK, false)
    if (sourceAttempt) await performTask(versionId, SOURCE_TASK, sourceAttempt, translate, signal)
    const version = await prisma.profileBioVersion.findUniqueOrThrow({ where: { id: versionId } })
    if (version.sourceLanguage) {
      const languages = version.targetLanguages.filter(language => !sameBioLanguage(version.sourceLanguage, language))
      // Four workers bound provider concurrency; the shared deadline also covers queued languages.
      let next = 0
      await Promise.all(Array.from({ length: Math.min(4, languages.length) }, async () => {
        while (next < languages.length && !signal.aborted) {
          const language = languages[next++]
          const attempt = await claimTask(versionId, language, false)
          if (attempt) await performTask(versionId, language, attempt, translate, signal)
        }
      }))
    }
  } finally { await settleVersion(versionId, true) }
}

export async function getBioSnapshot(userId: string, viewerId: string, locale: string, requestedLanguage?: string): Promise<ProfileBioSnapshot | null> {
  const user = await prisma.user.findUnique({ where: { id: userId, isActive: true }, select: { bio: true } })
  if (!user) return null
  const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { defaultDisplayLanguage: true, primaryLanguages: true, defaultConversationLanguages: true } })
  const language = requestedLanguage || resolveBioDisplayLanguage(viewer?.defaultDisplayLanguage, viewer?.primaryLanguages ?? [], viewer?.defaultConversationLanguages ?? [], locale)
  let state = await prisma.profileBioState.findUnique({ where: { userId } })
  if (state?.currentVersionId) await settleVersion(state.currentVersionId)
  state = await prisma.profileBioState.findUnique({ where: { userId } })
  const version = state?.publishedVersionId ? await prisma.profileBioVersion.findUnique({ where: { id: state.publishedVersionId } }) : null
  if (version) await prisma.profileBioTranslation.updateMany({ where: { versionId: version.id, status: 'running', deadlineAt: { lte: new Date() } }, data: { status: 'failed', text: null } })
  const translation = version ? await prisma.profileBioTranslation.findUnique({ where: { versionId_language: { versionId: version.id, language } } }) : null
  const sourceTask = version ? await prisma.profileBioTranslation.findUnique({ where: { versionId_language: { versionId: version.id, language: SOURCE_TASK } } }) : null
  const draftVersion = state?.currentVersionId ? await prisma.profileBioVersion.findUnique({ where: { id: state.currentVersionId }, include: { translations: true } }) : null
  return {
    versionId: version?.id ?? null, original: state ? version?.sourceText ?? '' : user.bio ?? '', sourceLanguage: version?.sourceLanguage ?? null,
    detecting: !version?.sourceLanguage && (sourceTask?.status === 'running' || Boolean(version && version.status !== 'complete')),
    language, translation: translation?.status === 'succeeded' ? translation.text : null,
    status: translation?.status === 'succeeded' ? 'succeeded' : translation?.status === 'running' ? 'running' : translation?.status === 'failed' ? 'failed' : version && version.status !== 'complete' && version.targetLanguages.includes(language) ? 'running' : 'idle',
    updating: Boolean(draftVersion && draftVersion.status !== 'complete'),
    ...(viewerId === userId ? { draft: { original: user.bio ?? '', status: !draftVersion || !user.bio ? 'succeeded' as const : draftVersion.status !== 'complete' ? 'running' as const : !draftVersion.sourceLanguage || draftVersion.targetLanguages.some(language => !sameBioLanguage(draftVersion.sourceLanguage, language) && !draftVersion.translations.some(row => row.language === language && row.status === 'succeeded')) ? 'failed' as const : 'succeeded' as const } } : {}),
  }
}

// Called only by an explicit POST. Reading a profile never starts/retries translation.
async function ensureBioVersion(userId: string) {
  return prisma.$transaction(async tx => {
    await lockUser(tx, userId)
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { bio: true } })
    const state = await tx.profileBioState.findUnique({ where: { userId } })
    if (state) return state.publishedVersionId ? tx.profileBioVersion.findUnique({ where: { id: state.publishedVersionId } }) : null
    if (!user.bio) return null
    const legacy = await tx.profileBioVersion.create({ data: { userId, sourceText: user.bio, targetLanguages: [], status: 'complete', deadlineAt: new Date() } })
    await tx.profileBioState.create({ data: { userId, currentVersionId: legacy.id, publishedVersionId: legacy.id } })
    return legacy
  })
}

export async function prepareBioLanguageDetection(userId: string) {
  const version = await ensureBioVersion(userId)
  if (!version || version.sourceLanguage || version.status !== 'complete') return null
  const attempt = await claimTask(version.id, SOURCE_TASK, false)
  return attempt ? () => performTask(version.id, SOURCE_TASK, attempt, translateProfileBio) : null
}

export async function requestBioTranslation(userId: string, language: string) {
  const version = await ensureBioVersion(userId)
  if (!version || sameBioLanguage(version.sourceLanguage, language)) return null
  // During an initial batch, its existing worker owns source detection/default targets.
  if (version.status !== 'complete' && version.targetLanguages.includes(language)) return null
  const attempt = await claimTask(version.id, language, true, version.status !== 'complete' ? 90_000 : 35_000)
  if (!attempt) return null
  return async (translate: BioTranslator = translateProfileBio) => {
    try {
      if (version.status !== 'complete') {
        while (Date.now() < version.deadlineAt.getTime()) {
          const active = await prisma.profileBioVersion.findUnique({ where: { id: version.id } })
          if (active?.status === 'complete') break
          await new Promise(resolve => setTimeout(resolve, 250))
        }
        await settleVersion(version.id)
      }
      const detected = await prisma.profileBioVersion.findUniqueOrThrow({ where: { id: version.id } })
      if (!detected.sourceLanguage) {
        const sourceAttempt = await claimTask(version.id, SOURCE_TASK, true)
        if (sourceAttempt) await performTask(version.id, SOURCE_TASK, sourceAttempt, translate)
        else {
          // Wait only for the already-running detection, without retrying failures.
          const deadline = Date.now() + 15_000
          while (Date.now() < deadline) {
            const source = await prisma.profileBioTranslation.findUnique({ where: { versionId_language: { versionId: version.id, language: SOURCE_TASK } } })
            if (source?.status !== 'running') break
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
      }
      const latest = await prisma.profileBioVersion.findUniqueOrThrow({ where: { id: version.id } })
      if (!latest.sourceLanguage) throw new Error('unknown_source')
      if (sameBioLanguage(latest.sourceLanguage, language)) {
        await prisma.profileBioTranslation.deleteMany({ where: { versionId: version.id, language, attemptId: attempt } })
        return
      }
      await performTask(version.id, language, attempt, translate)
    } catch { await prisma.profileBioTranslation.updateMany({ where: { versionId: version.id, language, attemptId: attempt, status: 'running' }, data: { status: 'failed', text: null } }) }
  }
}

export async function getPublishedBioText(userId: string, fallback: string | null): Promise<string | null> {
  let state = await prisma.profileBioState.findUnique({ where: { userId } })
  if (!state) return fallback
  if (state.currentVersionId) await settleVersion(state.currentVersionId)
  state = await prisma.profileBioState.findUnique({ where: { userId } })
  if (!state?.publishedVersionId) return null
  const version = await prisma.profileBioVersion.findUnique({ where: { id: state.publishedVersionId }, select: { sourceText: true } })
  return version?.sourceText ?? null
}
