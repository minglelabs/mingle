import { prisma } from '@/lib/prisma'
import { HAMZZI_USER_ID } from '@/lib/hamzzi'
import { sanitizeSttLanguageSelection } from '@/lib/stt-languages'

const LOOKBACK_MESSAGES = 20

/**
 * The language a staff reply written as Hamzzi goes out in: the language the
 * other person last wrote in (what they are practicing with Hamzzi), else the
 * language Hamzzi last wrote in, else English. Staff type in any language;
 * the reply is translated into this one, like an operator's persona language.
 */
export async function resolveHamzziStaffReplyLanguage(sessionKey: string): Promise<string> {
  const recent = await prisma.appMessage.findMany({
    where: { sessionKey, userId: { not: null }, OR: [{ isDeleted: false }, { isDeleted: null }] },
    orderBy: { createdAt: 'desc' },
    take: LOOKBACK_MESSAGES,
    select: { userId: true, sourceLanguage: true },
  })
  const languageOf = (row: { sourceLanguage: string }) => sanitizeSttLanguageSelection([row.sourceLanguage])[0] ?? null
  for (const row of recent) {
    if (row.userId === HAMZZI_USER_ID) continue
    const language = languageOf(row)
    if (language) return language
  }
  for (const row of recent) {
    const language = row.userId === HAMZZI_USER_ID ? languageOf(row) : null
    if (language) return language
  }
  return 'en'
}
