import { after, NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { canonicalizeSttLanguageCode } from '@/lib/stt-languages'
import { matchesExpectedAccount } from '@/lib/request-account-guard'
import { getBioSnapshot, requestBioTranslation, prepareBioLanguageDetection } from '@/server/profile-bio'

export async function profileBioResponse(request: NextRequest, userId: string) {
  const session = await getServerSession(getAuthOptions())
  const viewerId = session?.user?.id
  if (!viewerId || !matchesExpectedAccount(request, session)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const blocked = await prisma.userBlock.findFirst({ where: { blockerId: userId, blockedId: viewerId }, select: { blockerId: true } })
  if (blocked) return NextResponse.json({ error: 'user_unavailable' }, { status: 403 })
  const rawLanguage = request.nextUrl.searchParams.get('language')
  const language = rawLanguage ? canonicalizeSttLanguageCode(rawLanguage) : undefined
  if (rawLanguage && !language) return NextResponse.json({ error: 'invalid_language' }, { status: 400 })
  const locale = request.nextUrl.searchParams.get('locale') || 'en'
  let snapshot = await getBioSnapshot(userId, viewerId, locale, language || undefined)
  if (!snapshot) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (request.method === 'GET' && !snapshot.sourceLanguage && snapshot.original) {
    // Detect only the source language of legacy bios; never pretranslate them on view.
    const detect = await prepareBioLanguageDetection(userId)
    if (detect) after(detect)
    snapshot = await getBioSnapshot(userId, viewerId, locale, language || undefined)
  }
  if (request.method === 'POST') {
    const job = await requestBioTranslation(userId, snapshot!.language)
    if (job) after(() => job())
    snapshot = await getBioSnapshot(userId, viewerId, locale, language || undefined)
  }
  return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'private, no-store' } })
}
