import { prisma } from '@/lib/prisma'
import { BAN_NOTICE_CATEGORIES, type BanNoticeCategory } from '@/i18n/home-copy'

// Service notices behind the strip on top of the home tab
// (docs/home-explore-rooms-plan.md, "공지 띠"). A ban notice never names the
// person: the name is masked, the reason is only a category, and no photo is
// kept. A week with no ban shows no strip.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
export const NOTICE_LIST_LIMIT = 50

export type NoticeText = { title: string; body: string }

export type NoticeDto =
  | { id: string; kind: 'ban'; maskedName: string; category: BanNoticeCategory; publishedAt: string }
  | { id: string; kind: 'general'; title: string; body: string; isImportant: boolean; publishedAt: string }

/** "Jimin" → "J***". Only the first character survives; an empty name becomes "***". */
export function maskNoticeName(rawName: string | null | undefined): string {
  const first = Array.from((rawName ?? '').trim())[0]
  return first ? `${first}***` : '***'
}

export function normalizeBanCategory(raw: unknown): BanNoticeCategory {
  return (BAN_NOTICE_CATEGORIES as readonly string[]).includes(String(raw)) ? (raw as BanNoticeCategory) : 'other'
}

/** The notice text for an app language: that language, else English, else Korean, else whatever is there. */
export function pickNoticeText(texts: unknown, locale: string): NoticeText | null {
  if (!texts || typeof texts !== 'object' || Array.isArray(texts)) return null
  const byLocale = texts as Record<string, unknown>
  const language = locale.trim().toLowerCase().split(/[-_]/)[0]
  const candidates = [locale, language, 'en', 'ko', ...Object.keys(byLocale)]
  for (const key of candidates) {
    const entry = byLocale[key]
    if (!entry || typeof entry !== 'object') continue
    const { title, body } = entry as { title?: unknown; body?: unknown }
    const cleanTitle = typeof title === 'string' ? title.trim() : ''
    const cleanBody = typeof body === 'string' ? body.trim() : ''
    if (cleanTitle || cleanBody) return { title: cleanTitle, body: cleanBody }
  }
  return null
}

type NoticeRow = {
  id: string
  kind: string
  maskedName: string | null
  category: string | null
  texts: unknown
  isImportant: boolean
  publishedAt: Date
}

export function toNoticeDto(row: NoticeRow, locale: string): NoticeDto | null {
  if (row.kind === 'ban') {
    return {
      id: row.id,
      kind: 'ban',
      maskedName: row.maskedName?.trim() || '***',
      category: normalizeBanCategory(row.category),
      publishedAt: row.publishedAt.toISOString(),
    }
  }
  const text = pickNoticeText(row.texts, locale)
  if (!text) return null
  return { id: row.id, kind: 'general', title: text.title, body: text.body, isImportant: row.isImportant, publishedAt: row.publishedAt.toISOString() }
}

const NOTICE_SELECT = { id: true, kind: true, maskedName: true, category: true, texts: true, isImportant: true, publishedAt: true } as const

/** How many accounts were permanently banned in the last seven days (ban notices published). */
export async function countWeekBans(now: Date = new Date()): Promise<number> {
  return prisma.appNotice.count({
    where: { kind: 'ban', deletedAt: null, publishedAt: { gte: new Date(now.getTime() - WEEK_MS), lte: now } },
  })
}

export type NoticeSummary = { weekBanCount: number; unreadCount: number }

/** What the home strip needs: this week's ban count and how many notices the user has not seen. */
export async function readNoticeSummary(userId: string | null, now: Date = new Date()): Promise<NoticeSummary> {
  const [weekBanCount, user] = await Promise.all([
    countWeekBans(now),
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { noticesSeenAt: true } }) : Promise.resolve(null),
  ])
  const unreadCount = userId
    ? await prisma.appNotice.count({
      where: { deletedAt: null, publishedAt: { lte: now, ...(user?.noticesSeenAt ? { gt: user.noticesSeenAt } : {}) } },
    })
    : 0
  return { weekBanCount, unreadCount }
}

/** The newest notices, and marks them seen for the user. */
export async function listNotices(userId: string | null, locale: string, now: Date = new Date()): Promise<NoticeDto[]> {
  const rows = await prisma.appNotice.findMany({
    where: { deletedAt: null, publishedAt: { lte: now } },
    orderBy: { publishedAt: 'desc' },
    take: NOTICE_LIST_LIMIT,
    select: NOTICE_SELECT,
  })
  if (userId) await prisma.user.updateMany({ where: { id: userId }, data: { noticesSeenAt: now } })
  return rows.map((row) => toNoticeDto(row, locale)).filter((notice): notice is NoticeDto => notice !== null)
}

/** Admin: one ban notice. `name` is masked here; the full name is never stored. */
export async function createBanNotice(input: { name: string; category: unknown; publishedAt?: Date }): Promise<string> {
  const row = await prisma.appNotice.create({
    data: {
      kind: 'ban',
      maskedName: maskNoticeName(input.name),
      category: normalizeBanCategory(input.category),
      ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    },
    select: { id: true },
  })
  return row.id
}

/** Admin: one text notice. Languages with neither title nor body are dropped; returns null when nothing is left. */
export async function createGeneralNotice(input: { texts: Record<string, Partial<NoticeText>>; isImportant?: boolean }): Promise<string | null> {
  const texts: Record<string, NoticeText> = {}
  for (const [locale, text] of Object.entries(input.texts)) {
    const title = (text.title ?? '').trim().slice(0, 200)
    const body = (text.body ?? '').trim().slice(0, 4000)
    if (title || body) texts[locale] = { title, body }
  }
  if (Object.keys(texts).length === 0) return null
  const row = await prisma.appNotice.create({
    data: { kind: 'general', texts, isImportant: Boolean(input.isImportant) },
    select: { id: true },
  })
  return row.id
}

/** Admin: takes a notice down (kept in the table). */
export async function deleteNotice(id: string): Promise<void> {
  await prisma.appNotice.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } })
}
