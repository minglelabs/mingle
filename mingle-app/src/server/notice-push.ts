import { prisma } from '@/lib/prisma'
import { exploreHref } from '@/lib/home-routes'
import { resolveSupportedLocaleTag } from '@/i18n/config'
import { pickNoticeText } from '@/server/notices'
import { sendPushToUsers, type PushMessage, type PushRecipient } from '@/server/push-notifications'

// Only notices marked important are pushed (docs/home-explore-rooms-plan.md).
// Everyone with a registered device gets it once, in their own language; the
// tap opens Home with the notice list.

/** Opens Home with the notice list (HomeNotices reads `notices=1`). */
export function noticeListHref(locale: string): string {
  return `${exploreHref(locale)}?notices=1`
}

/** The push for one recipient, or null when the notice has no text they can read. */
export function buildImportantNoticePush(noticeId: string, texts: unknown, recipient: PushRecipient): PushMessage | null {
  const text = pickNoticeText(texts, recipient.language)
  if (!text) return null
  const title = text.title.trim()
  const body = text.body.replace(/\s+/g, ' ').trim()
  if (!title && !body) return null
  return {
    notificationId: `notice:${noticeId}`,
    type: 'important_notice',
    actorId: '',
    actorLabel: '',
    recipientLanguage: recipient.language,
    noticeTitle: title || undefined,
    messagePreview: body || title,
    navigationUrl: noticeListHref(resolveSupportedLocaleTag(recipient.language) ?? 'en'),
    collapseKey: `notice:${noticeId}`,
  }
}

const PUSH_BATCH = 500

/**
 * Pushes one important notice to every live account with a registered device.
 * Does nothing for a notice that is not important, is taken down, or was
 * pushed already. Returns how many accounts it was sent for.
 */
export async function sendImportantNoticePush(noticeId: string): Promise<number> {
  // Claim the notice first, so two calls never send it twice.
  const claimed = await prisma.appNotice.updateMany({
    where: { id: noticeId, kind: 'general', isImportant: true, deletedAt: null, pushedAt: null },
    data: { pushedAt: new Date() },
  })
  if (claimed.count === 0) return 0
  const notice = await prisma.appNotice.findUnique({ where: { id: noticeId }, select: { texts: true } })
  if (!notice) return 0

  let sent = 0
  let cursor: string | undefined
  for (;;) {
    const users = await prisma.user.findMany({
      where: { isDeleted: false, bannedAt: null, mergedIntoUserId: null, pushTokens: { some: {} } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: PUSH_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (users.length === 0) break
    await sendPushToUsers(users.map((user) => user.id), (recipient) => buildImportantNoticePush(noticeId, notice.texts, recipient))
    sent += users.length
    cursor = users[users.length - 1].id
    if (users.length < PUSH_BATCH) break
  }
  return sent
}
